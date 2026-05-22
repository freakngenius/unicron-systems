import type { VercelRequest, VercelResponse } from '@vercel/node';
import { forward, handleError } from '../_lib/proxy.js';
import { getServiceClient } from '../_lib/supabaseAdmin.js';

type CustomerIntake = {
  name: string;
  slug: string;
  contact_name?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    // Parse + strip our internal customer_intake field before forwarding so
    // Stream D never sees an unknown field (its validator would reject it).
    const { customer_intake, ...upstreamBody } = parseBody(req);
    const intake = sanitizeIntake(customer_intake);

    const upstream = await forward({
      upstream: 'architect',
      path: '/api/architect/decompose',
      method: 'POST',
      body: JSON.stringify(upstreamBody),
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? '';
    res.status(upstream.status);
    res.setHeader('content-type', 'application/json');

    // Stamp the intake onto the new architect_sessions row. Fire-and-forget
    // so a Supabase failure does not block the operator's response — the
    // error is logged server-side for follow-up.
    if (intake && upstream.ok) {
      const parsed = safeJson(text);
      const sessionId =
        parsed && typeof parsed.session_id === 'string' ? parsed.session_id : null;
      if (sessionId) {
        stampIntakeOnSession(sessionId, intake).catch((err) => {
          console.error('[decompose-proxy] customer_intake stamp failed', {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    if (contentType.includes('application/json') || text.length === 0) {
      res.send(text || '{}');
      return;
    }
    res.send(
      JSON.stringify({
        ok: false,
        upstream_status: upstream.status,
        body: text.slice(0, 1000),
      }),
    );
  } catch (err) {
    handleError(err, res);
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf-8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function sanitizeIntake(value: unknown): CustomerIntake | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const slug = typeof v.slug === 'string' ? v.slug.trim() : '';
  if (!name || !slug) return null;
  const contactName = typeof v.contact_name === 'string' ? v.contact_name.trim() : '';
  return {
    name,
    slug,
    ...(contactName ? { contact_name: contactName } : {}),
  };
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function stampIntakeOnSession(
  sessionId: string,
  intake: CustomerIntake,
): Promise<void> {
  const client = getServiceClient();
  const { data, error: readErr } = await client
    .schema('pathfinder')
    .from('architect_sessions')
    .select('input_payload')
    .eq('id', sessionId)
    .maybeSingle();
  if (readErr) throw new Error(`architect_sessions read failed: ${readErr.message}`);
  const existing =
    data && typeof data.input_payload === 'object' && data.input_payload !== null
      ? (data.input_payload as Record<string, unknown>)
      : {};
  const nextPayload = { ...existing, customer_intake: intake };
  const { error: writeErr } = await client
    .schema('pathfinder')
    .from('architect_sessions')
    .update({ input_payload: nextPayload })
    .eq('id', sessionId);
  if (writeErr) throw new Error(`architect_sessions update failed: ${writeErr.message}`);
}
