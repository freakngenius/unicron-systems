// Revenue.tsx — Sprint 5 Stream F
// Stripe connector stub + pipeline-weighted forecast from nervous_system.customers.
// If VITE_STRIPE_ENABLED is 'true', shows a "Connect Stripe" placeholder (live
// Stripe API call requires server-side STRIPE_SECRET_KEY — not surfaced to browser).

import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  status: string | null;
  deal_value: number | null;
  arr: number | null;
  mrr: number | null;
  health_score: number | null;
}

// Deal-stage → pipeline weight multiplier
const STAGE_WEIGHT: Record<string, number> = {
  Proposal:  0.5,
  Contract:  0.85,
  Active:    1.0,
  Expansion: 1.0,
};

// ── Stripe MRR card ───────────────────────────────────────────────────────────
// Atrium audit fix item #5: replace the alert() stub with a real fetch against
// /api/atrium/stripe-mrr. The endpoint returns configured:false until
// STRIPE_SECRET_KEY is set, at which point the card renders live MRR/ARR.

type StripeState =
  | { phase: 'loading' }
  | { phase: 'unconfigured'; message: string }
  | { phase: 'live'; mrr_usd: number; arr_usd: number; active_subscriptions: number; fetched_at: string }
  | { phase: 'error'; message: string };

function fmtUsd(n: number): string {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function StripeStub() {
  const [state, setState] = useState<StripeState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/atrium/stripe-mrr');
        const json = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        if (res.status === 503 && json.configured === false) {
          setState({
            phase: 'unconfigured',
            message: typeof json.message === 'string' ? json.message : 'Stripe not configured.',
          });
        } else if (res.ok && json.configured === true) {
          setState({
            phase: 'live',
            mrr_usd: Number(json.mrr_usd ?? 0),
            arr_usd: Number(json.arr_usd ?? 0),
            active_subscriptions: Number(json.active_subscriptions ?? 0),
            fetched_at: String(json.fetched_at ?? ''),
          });
        } else {
          setState({
            phase: 'error',
            message: typeof json.error === 'string' ? json.error : `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.phase === 'live') {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl p-6 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1">MRR</div>
            <div className="mono text-[20px] font-semibold text-status-green tabular-nums">
              {fmtUsd(state.mrr_usd)}
            </div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1">ARR</div>
            <div className="mono text-[18px] font-semibold text-text-primary tabular-nums">
              {fmtUsd(state.arr_usd)}
            </div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1">
              Active subs
            </div>
            <div className="mono text-[18px] font-semibold text-text-primary tabular-nums">
              {state.active_subscriptions}
            </div>
          </div>
        </div>
        <div className="mono text-[10px] text-text-muted">
          From Stripe · fetched {new Date(state.fetched_at).toLocaleTimeString()}
        </div>
      </div>
    );
  }

  // unconfigured | loading | error all share the same CTA card layout
  const subtitle =
    state.phase === 'loading'
      ? 'Checking Stripe connection…'
      : state.phase === 'error'
        ? `Stripe call failed: ${state.message}`
        : 'No revenue connector configured yet — pre-revenue, pilot in flight.';

  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-6 flex items-center justify-between gap-6 flex-wrap">
      <div>
        <div className="mono text-[14px] font-semibold text-text-primary mb-1.5">Revenue</div>
        <div className="mono text-[12px] text-text-secondary">{subtitle}</div>
        <div className="mono text-[11px] text-text-muted mt-1">
          Set STRIPE_SECRET_KEY in Vercel env to auto-pull MRR / ARR / active subscriptions.
        </div>
      </div>
      <a
        href="https://dashboard.stripe.com/apikeys"
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 bg-accent-orange text-white rounded-lg hover:bg-[#D4652E] transition-colors shrink-0 no-underline"
      >
        Get Stripe key ↗
      </a>
    </div>
  );
}

// ── Pipeline forecast ─────────────────────────────────────────────────────────

function PipelineTable({ customers }: { customers: Customer[] }) {
  const pipeline = customers.filter(
    (c) => c.status && STAGE_WEIGHT[c.status] !== undefined,
  );

  if (pipeline.length === 0) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
          No pipeline customers
        </div>
        <div className="mono text-[11px] text-text-muted">
          Customers in Proposal or Contract status will appear here.
        </div>
      </div>
    );
  }

  const totalWeighted = pipeline.reduce((sum, c) => {
    const val = c.deal_value ?? c.arr ?? 0;
    const w = STAGE_WEIGHT[c.status ?? ''] ?? 0;
    return sum + val * w;
  }, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
          Pipeline-weighted forecast
        </span>
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] text-text-muted">Weighted total</span>
          <span className="mono text-[14px] font-semibold text-status-green tabular-nums">
            ${Math.round(totalWeighted).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-default">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="bg-bg-card border-b border-border-default">
              {['Customer', 'Stage', 'Deal Value', 'Weight', 'Weighted'].map((h, i) => (
                <th
                  key={i}
                  className={[
                    'px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-text-muted',
                    i >= 2 ? 'text-right' : 'text-left',
                  ].join(' ')}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pipeline.map((c) => {
              const val = c.deal_value ?? c.arr ?? 0;
              const weight = STAGE_WEIGHT[c.status ?? ''] ?? 0;
              const weighted = val * weight;
              return (
                <tr
                  key={c.id}
                  className="border-b border-border-default hover:bg-bg-raised transition-colors"
                >
                  <td className="px-4 py-3 mono text-[12px] text-text-primary">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="mono text-[10px] px-2 py-0.5 rounded-full bg-accent-orange/15 text-accent-orange uppercase tracking-[0.08em]">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-[12px] text-text-primary text-right tabular-nums">
                    {val ? `$${val.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary text-right">
                    {Math.round(weight * 100)}%
                  </td>
                  <td className="px-4 py-3 mono text-[12px] text-status-green text-right tabular-nums">
                    ${Math.round(weighted).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Revenue() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // PGRST106 fix: use ns_list_customers_pipeline RPC
      const { data, error: err } = await getSupabase()
        .rpc('ns_list_customers_pipeline');

      if (err) throw err;
      setCustomers((data as Customer[] | null) ?? []);
    } catch (e) {
      // customers table may not have deal_value — show empty state gracefully
      setCustomers([]);
      const msg = e instanceof Error ? e.message : String(e);
      // Only surface as error if it's not a "column does not exist" type issue
      if (!msg.includes('does not exist') && !msg.includes('undefined')) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Stripe stub — always shown since STRIPE_SECRET_KEY is not present */}
      <StripeStub />

      {/* Pipeline forecast */}
      <div>
        <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-3">
          Pipeline
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 bg-bg-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-4 py-3">
            <div className="mono text-[11px] text-[#E14B4B]">{error}</div>
          </div>
        ) : (
          <PipelineTable customers={customers} />
        )}
      </div>
    </div>
  );
}
