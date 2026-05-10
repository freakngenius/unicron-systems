// api/atrium/customers/index.ts — Sprint 5 Stream E
// GET  /api/atrium/customers — list nervous_system.customers (optional ?status= filter)
// POST /api/atrium/customers — create a new customer (taboo-checked, audit-logged)
//
// Uses service role key — nervous_system schema not exposed via PostgREST anon.
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

type PostBody = {
  name?: string;
  status?: string;
  primary_contact?: string;
  notes?: unknown;
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
    return true; // allow on failure — non-blocking
  }
}

async function writeAuditLog(
  action: string,
  entityId: string,
  beforeState: unknown,
  afterState: unknown,
): Promise<void> {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await supabase.schema('nervous_system').from('audit_log').insert({
      action,
      entity_type: 'customer',
      entity_id: entityId,
      before_state: beforeState,
      after_state: afterState,
      performed_by: 'atrium_ui',
    });
  } catch {
    // Non-fatal
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    jsonResponse(res, 500, { error: 'Supabase env vars not configured' });
    return;
  }

  // ─── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const supabase = createClient(supabaseUrl, serviceKey);
    const url = new URL(req.url ?? '/', `http://localhost`);
    const statusFilter = url.searchParams.get('status');

    let query = supabase
      .schema('nervous_system')
      .from('customers')
      .select('id, name, status, primary_contact, notes, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      // Table may not exist yet — return empty array so UI shows placeholder
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        jsonResponse(res, 200, []);
        return;
      }
      jsonResponse(res, 500, { error: error.message });
      return;
    }

    jsonResponse(res, 200, (data as CustomerRow[]) ?? []);
    return;
  }

  // ─── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let rawBody: string;
    try {
      rawBody = await readBody(req);
    } catch {
      jsonResponse(res, 400, { error: 'Failed to read body' });
      return;
    }

    let body: PostBody;
    try {
      body = JSON.parse(rawBody) as PostBody;
    } catch {
      jsonResponse(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    if (!body?.name) {
      jsonResponse(res, 400, { error: 'name is required' });
      return;
    }

    const allowed = await tabooCheck('create_customer', body.name);
    if (!allowed) {
      jsonResponse(res, 403, { error: 'Taboo check blocked this action' });
      return;
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const insertPayload = {
      name: body.name,
      status: body.status ?? 'Cold',
      primary_contact: body.primary_contact ?? null,
      notes: body.notes ?? null,
    };

    const { data, error } = await supabase
      .schema('nervous_system')
      .from('customers')
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      jsonResponse(res, 500, { error: error?.message ?? 'Insert failed' });
      return;
    }

    const created = data as CustomerRow;
    await writeAuditLog('create_customer', created.id, null, created);
    jsonResponse(res, 201, created);
    return;
  }

  jsonResponse(res, 405, { error: 'method not allowed' });
}
