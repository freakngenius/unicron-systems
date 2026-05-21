// GET /api/atrium/stripe-mrr — current MRR pulled from Stripe.
//
// Atrium audit fix item #5: replaces the "Connect Stripe" alert() stub in
// money/Revenue.tsx with a real endpoint. Returns 503 with configured:false
// until STRIPE_SECRET_KEY is set in Vercel env, so the UI can show a CTA
// instead of an empty $0 card.
//
// Uses raw fetch against the Stripe REST API rather than the official SDK to
// avoid pulling a new dep into the Vercel bundle.
//
// Response shape:
//   { configured: true,  mrr_usd: 0, arr_usd: 0, active_subscriptions: 0, fetched_at: ISO }
//   { configured: false, message: '...' }   (when env not set)
//   { configured: true,  error: '...' }     (when Stripe call fails)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const STRIPE_API = 'https://api.stripe.com/v1';

type StripeSubscription = {
  id: string;
  status: string;
  items: {
    data: Array<{
      price: {
        unit_amount: number | null;
        recurring: { interval: 'day' | 'week' | 'month' | 'year' } | null;
      };
      quantity: number;
    }>;
  };
};

type StripeListResponse<T> = {
  object: 'list';
  data: T[];
  has_more: boolean;
};

async function stripeFetch<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Version': '2024-06-20',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

// Normalize a recurring price to monthly USD.
function monthlyUsd(unitAmount: number | null, interval: string | undefined, qty: number): number {
  if (unitAmount === null || unitAmount === undefined) return 0;
  // Stripe amounts are cents.
  const dollars = (unitAmount * qty) / 100;
  switch (interval) {
    case 'month':
      return dollars;
    case 'year':
      return dollars / 12;
    case 'week':
      return dollars * (52 / 12);
    case 'day':
      return dollars * (365 / 12);
    default:
      return 0;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    res.status(503).json({
      configured: false,
      message:
        'Stripe is not connected. Set STRIPE_SECRET_KEY in Vercel env to enable MRR pull. ' +
        'See Atrium audit fix item #5 closeout for the paste-ready unblock.',
    });
    return;
  }

  try {
    // Walk active subscriptions (paginate until !has_more, cap at 5 pages).
    let mrrUsd = 0;
    let activeCount = 0;
    let startingAfter: string | undefined;
    let pages = 0;
    while (pages < 5) {
      const qs = new URLSearchParams({ status: 'active', limit: '100' });
      if (startingAfter) qs.set('starting_after', startingAfter);
      const page = await stripeFetch<StripeListResponse<StripeSubscription>>(
        `/subscriptions?${qs.toString()}`,
        key,
      );
      for (const sub of page.data) {
        activeCount += 1;
        for (const item of sub.items.data) {
          mrrUsd += monthlyUsd(
            item.price.unit_amount,
            item.price.recurring?.interval,
            item.quantity ?? 1,
          );
        }
      }
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      pages += 1;
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).json({
      configured: true,
      mrr_usd: Math.round(mrrUsd * 100) / 100,
      arr_usd: Math.round(mrrUsd * 12 * 100) / 100,
      active_subscriptions: activeCount,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      configured: true,
      error: msg,
      message: 'Stripe call failed. Verify STRIPE_SECRET_KEY validity in Vercel env.',
    });
  }
}
