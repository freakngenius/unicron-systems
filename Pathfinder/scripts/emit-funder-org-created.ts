// scripts/emit-funder-org-created.ts — Funder onboarding Stage 2 follow-up.
//
// One-shot helper that emits the `pathfinder/org.created` Inngest event
// for the Funder organization row. Used only when seed-funder-org.ts was
// run via the direct supabaseAdmin path (which does not auto-emit the
// event — see the script's footer). The --via-api path emits this
// implicitly via POST /api/organizations.
//
// Reads ORG_ID from $1 or from a lookup against pathfinder.organizations
// by slug=funder. Idempotent on the receiving side: the orgCreated
// Inngest function has an "already advanced" guard that no-ops the
// status flip if status !== 'setting_up'.

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

import { createClient } from '@supabase/supabase-js';

// Use the Inngest Event API directly to avoid pulling the inngest SDK,
// which lives in the main worktree's node_modules and may not be
// hoisted into a sibling worktree. The Event API contract is stable:
// POST https://inn.gs/e/<EVENT_KEY> with { name, data }.
async function sendEvent(name: string, data: Record<string, unknown>): Promise<unknown> {
  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) throw new Error('INNGEST_EVENT_KEY not set');
  const url = `https://inn.gs/e/${eventKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) {
    throw new Error(`Inngest event POST failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function main() {
  let orgId = process.argv[2];
  let createdAt: string | undefined;
  let slug = 'funder';

  if (!orgId) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('need SUPABASE_SERVICE_ROLE_KEY or pass org_id as $1');
    const sb = createClient(url, key, { db: { schema: 'pathfinder' }, auth: { persistSession: false } });
    const { data, error } = await sb
      .from('organizations')
      .select('id, slug, created_at, status')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`lookup failed: ${error.message}`);
    if (!data) throw new Error(`org with slug=${slug} not found`);
    orgId = (data as { id: string }).id;
    createdAt = (data as { created_at: string }).created_at;
    console.log(`[emit-org-created] found Funder: id=${orgId} status=${(data as { status: string }).status}`);
  }

  const result = await sendEvent('pathfinder/org.created', {
    organization_id: orgId,
    slug,
    created_at: createdAt ?? new Date().toISOString(),
  });
  console.log('[emit-org-created] event accepted by Inngest:', JSON.stringify(result));
}

main().catch((err: unknown) => {
  console.error('[emit-org-created] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
