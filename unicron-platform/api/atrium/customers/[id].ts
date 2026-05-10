// api/atrium/customers/[id].ts — Sprint 5 Stream E
// PATCH /api/atrium/customers/:id — update status/notes/primary_contact
//
// Flow:
//   1. Validate request
//   2. Taboo check — GET /api/atrium/taboo/check?action=update_customer_status&entity_id={id}
//   3. Load current row (before_state)
//   4. Apply update via Supabase service role
//   5. Write audit_log entry
//   6. Return updated customer
//
// Follows the same createClient pattern as api/atrium/skills/run.ts.

import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

interface CustomerRow {
  id: string;
  name: string;
  status: string;
  primary_contact: string | null;
  notes: unknown | null;
  created_at: string;
  updated_at: string | null;
}

type PatchBody = {
  status?: string;
  notes?: unknown;
  primary_contact?: string;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function tabooCheck(action: string, entityId: string): Promise<boolean> {
  try {
    const base =
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const res = await fetch(
      `${base}/api/atrium/taboo/check?action=${encodeURIComponent(action)}&entity_id=${encodeURIComponent(entityId)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return true;
    const json = (await res.json()) as { allow?: boolean };
    return json.allow !== false;
  } catch {
    return true;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Extract :id from URL — /api/atrium/customers/[id]
  const idMatch = /\/api\/atrium\/customers\/([^/?]+)/.exec(req.url ?? '');
  const id = idMatch?.[1];

  if (!id) {
    jsonResponse(res, 400, { error: 'Missing customer id' });
    return;
  }

  if (req.method !== 'PATCH') {
    jsonResponse(res, 405, { error: 'method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    jsonResponse(res, 500, { error: 'Supabase env vars not configured' });
    return;
  }

  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch {
    jsonResponse(res, 400, { error: 'Failed to read body' });
    return;
  }

  let body: PatchBody;
  try {
    body = JSON.parse(rawBody) as PatchBody;
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const { status, notes, primary_contact } = body;
  if (status === undefined && notes === undefined && primary_contact === undefined) {
    jsonResponse(res, 400, { error: 'At least one field (status, notes, primary_contact) is required' });
    return;
  }

  // Taboo check
  const allowed = await tabooCheck('update_customer_status', id);
  if (!allowed) {
    jsonResponse(res, 403, { error: 'Taboo check blocked this action' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch before-state
  const { data: existing, error: fetchErr } = await supabase
    .schema('nervous_system')
    .from('customers')
    .select('id, name, status, primary_contact, notes, created_at, updated_at')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    jsonResponse(res, 404, { error: 'Customer not found' });
    return;
  }

  const beforeState = existing as CustomerRow;

  // Build update payload — only include defined fields
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (status !== undefined) updatePayload.status = status;
  if (notes !== undefined) updatePayload.notes = notes;
  if (primary_contact !== undefined) updatePayload.primary_contact = primary_contact;

  const { data: updated, error: updateErr } = await supabase
    .schema('nervous_system')
    .from('customers')
    .update(updatePayload)
    .eq('id', id)
    .select('id, name, status, primary_contact, notes, created_at, updated_at')
    .single();

  if (updateErr || !updated) {
    jsonResponse(res, 500, { error: updateErr?.message ?? 'Update failed' });
    return;
  }

  // Audit log — non-blocking
  try {
    await supabase.schema('nervous_system').from('audit_log').insert({
      action: 'update_customer_status',
      entity_type: 'customer',
      entity_id: id,
      before_state: beforeState,
      after_state: updated as CustomerRow,
      performed_by: 'atrium_ui',
    });
  } catch {
    // Non-fatal
  }

  jsonResponse(res, 200, updated as CustomerRow);
}
