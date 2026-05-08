// PATCH /api/atrium/action-items/:id
//
// Internal Atrium endpoint for editing nervous_system.action_items.
// Called exclusively from the unicron-platform Atrium Work tab via the
// actionItemsClient stub.
//
// Auth: x-unicron-api-key header — must match UNICRON_INTERNAL_API_KEY env var.
// Body: { dri?, status?, deferred_to?, closed? }
//
// Flow:
//  1. Verify API key
//  2. Validate body
//  3. Taboo Keeper check (nervous_system.taboos) — reject with 403 if matched
//  4. UPDATE nervous_system.action_items SET … WHERE id = :id
//  5. Append row to nervous_system.audit_log
//  6. Return updated row

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatchBody {
  dri?: string;
  status?: 'open' | 'in_progress' | 'done' | 'blocked' | 'broken_off';
  deferred_to?: string;
  closed?: boolean;
}

const VALID_STATUSES = new Set([
  'open',
  'in_progress',
  'done',
  'blocked',
  'broken_off',
]);

// ─── Supabase (nervous_system schema) ─────────────────────────────────────────
// We cannot reuse the Pathfinder supabase client here because it is pinned to
// the `pathfinder` schema. We build a one-off client pointed at `nervous_system`
// using the service-role key.

function getNsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, serviceKey, {
    db: { schema: 'nervous_system' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Taboo Keeper ─────────────────────────────────────────────────────────────

interface TabooRow {
  id: string;
  pattern: string;
  reason: string;
}

async function checkTaboo(
  ns: ReturnType<typeof getNsClient>,
  action: string,
): Promise<TabooRow | null> {
  // Fetch all active taboos and check if any pattern matches the action string.
  const { data, error } = await ns
    .from('taboos')
    .select('id, pattern, reason')
    .eq('active', true)
    .returns<TabooRow[]>();

  if (error || !data) return null;

  for (const taboo of data) {
    try {
      if (new RegExp(taboo.pattern, 'i').test(action)) return taboo;
    } catch {
      // Invalid regex in DB — skip, don't crash
    }
  }
  return null;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function writeAuditLog(
  ns: ReturnType<typeof getNsClient>,
  recordId: string,
  actor: string,
  patch: PatchBody,
): Promise<void> {
  await ns.from('audit_log').insert({
    table_name: 'action_items',
    action: 'patch_action_item',
    record_id: recordId,
    actor,
    metadata: patch,
    created_at: new Date().toISOString(),
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 1. Auth
  const apiKey = req.headers.get('x-unicron-api-key');
  const expectedKey = process.env.UNICRON_INTERNAL_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse + validate body
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { dri, status, deferred_to, closed } = body;
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status: ${status}` },
      { status: 400 },
    );
  }
  if (Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: 'Patch body is empty' },
      { status: 400 },
    );
  }

  const { id } = await params;

  // 3. Build patch object
  const patch: Record<string, unknown> = {};
  if (dri !== undefined) patch['dri'] = dri;
  if (status !== undefined) patch['status'] = status;
  if (deferred_to !== undefined) patch['deferred_to'] = deferred_to;
  if (closed) {
    patch['status'] = 'done';
    patch['closed_at'] = new Date().toISOString();
  }

  // 4. Taboo check — describe the action in plain English for matching
  const actionDesc = `patch action_item ${id}: ${JSON.stringify(patch)}`;
  let ns: ReturnType<typeof getNsClient>;
  try {
    ns = getNsClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Supabase config error' },
      { status: 500 },
    );
  }

  const matchedTaboo = await checkTaboo(ns, actionDesc);
  if (matchedTaboo) {
    return NextResponse.json(
      {
        error: 'Action refused by Taboo Keeper',
        taboo: matchedTaboo.reason,
        pattern: matchedTaboo.pattern,
      },
      { status: 403 },
    );
  }

  // 5. Write update
  const { data: updated, error: updateErr } = await ns
    .from('action_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, title, status, dri, updated_at')
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: updateErr.code === 'PGRST116' ? 404 : 500 },
    );
  }

  // 6. Audit log (non-blocking — failure does not abort the response)
  void writeAuditLog(ns, id, 'atrium-work-tab', body);

  return NextResponse.json(updated, { status: 200 });
}
