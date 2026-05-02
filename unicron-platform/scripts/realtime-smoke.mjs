// Phase 0.5 live Realtime smoke. Run from within unicron-platform/ so the
// node_modules resolution finds @supabase/supabase-js. Loads anon key from
// unicron-platform/.env.local and service-role key from Pathfinder/.env.local
// (or .env.production.local) for the test insert. Reads no secrets from
// command line and writes none to disk. Output goes to stdout; stop after
// receiving one event or 5s timeout.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd().endsWith('unicron-platform')
  ? path.dirname(process.cwd())
  : process.cwd();

function loadEnv(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

const platformEnv = loadEnv(path.join(REPO_ROOT, 'unicron-platform', '.env.local'));
const pathfinderEnvLocal = loadEnv(path.join(REPO_ROOT, 'Pathfinder', '.env.local'));
const pathfinderEnvProd = loadEnv(path.join(REPO_ROOT, 'Pathfinder', '.env.production.local'));

const SUPABASE_URL =
  platformEnv.get('VITE_SUPABASE_URL') ?? pathfinderEnvLocal.get('NEXT_PUBLIC_SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY =
  platformEnv.get('VITE_SUPABASE_ANON_KEY') ?? pathfinderEnvLocal.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY =
  pathfinderEnvLocal.get('SUPABASE_SERVICE_ROLE_KEY') ??
  pathfinderEnvProd.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FAIL: missing required env (URL=%s anon=%s svc=%s)',
    !!SUPABASE_URL, !!SUPABASE_ANON_KEY, !!SUPABASE_SERVICE_ROLE_KEY);
  process.exit(1);
}

const TIMEOUT_MS = 5000;

console.log(`[smoke] connecting to ${SUPABASE_URL}`);
// Service-role for both insert AND subscribe. Anon role lacks SELECT on
// unicron.* (intentional, per RLS), so anon-Realtime would never receive the
// postgres_changes broadcast. Real operator UI uses the `authenticated` role
// post-sign-in; that path is exercised by the unit tests + RLS policy
// inspection. Service-role smoke proves the publication + Realtime wire path.
const anonClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 1. Service-role inserts a test dispatch.
const { data: dispatch, error: dispatchErr } = await serviceClient
  .schema('unicron')
  .from('agent_dispatches')
  .insert({
    agent_name: 'realtime-smoke-test',
    customer_org_id: 'smoke-test',
    input_payload: { test: 'phase-0-5-realtime' },
    status: 'queued',
  })
  .select()
  .single();
if (dispatchErr) {
  console.error('FAIL: dispatch insert error:', dispatchErr);
  process.exit(1);
}
console.log(`[smoke] created dispatch id=${dispatch.id}`);

// 2. Anon-client subscribes via Realtime.
const startedAt = Date.now();
let received = null;

const channel = anonClient.channel(`smoke:${dispatch.id}`).on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'unicron',
    table: 'agent_dispatch_events',
    filter: `dispatch_id=eq.${dispatch.id}`,
  },
  (payload) => {
    if (received) return;
    received = { event: payload.new, ms: Date.now() - startedAt };
    console.log(`[smoke] received event after ${received.ms}ms event_type=${received.event.event_type}`);
  },
);

await new Promise((resolve) => {
  channel.subscribe(async (status) => {
    console.log(`[smoke] channel status=${status}`);
    if (status === 'SUBSCRIBED') {
      // Anon SUBSCRIBE is now live; service-role inserts the event.
      const { error: evErr } = await serviceClient
        .schema('unicron')
        .from('agent_dispatch_events')
        .insert({
          dispatch_id: dispatch.id,
          event_type: 'reasoning',
          payload: { text: 'phase-0-5 realtime smoke', ts: Date.now() },
        });
      if (evErr) {
        console.error('FAIL: event insert error:', evErr);
        process.exit(1);
      }
      console.log('[smoke] event inserted; awaiting Realtime delivery…');
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      resolve();
    }
  });
  setTimeout(resolve, TIMEOUT_MS);
});

// 3. Cleanup test rows so smoke leaves no production residue.
await serviceClient.schema('unicron').from('agent_dispatch_events').delete().eq('dispatch_id', dispatch.id);
await serviceClient.schema('unicron').from('agent_dispatches').delete().eq('id', dispatch.id);
await anonClient.removeChannel(channel);

if (!received) {
  console.error(`FAIL: no event received within ${TIMEOUT_MS}ms`);
  process.exit(1);
}
console.log(`[smoke] PASS event_received_ms=${received.ms} dispatch_id=${dispatch.id}`);
