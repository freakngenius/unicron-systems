// __tests__/schema/verifier.test.ts — integration tests for the Verifier
// schema additions in 0005_agent_expansion_layer1.sql.
//
// These tests run against the live Supabase project (anfihcusvekpovcchpoh).
// They exercise:
//
//   1. Inserting a project with `verified=true` succeeds
//   2. Updating a project to `verified=true, verifier_notes='passed all 4
//      checks', verifier_pass_count=1` succeeds
//   3. `agent_log` accepts `agent_name='verifier'`
//   4. `agent_log` rejects `agent_name='not-a-real-agent'`
//
// All test rows are tagged with a `_verifier_test_` prefix and cleaned up
// in `afterAll`. Skips the suite if the Supabase env vars are missing
// (so CI in environments without secrets just no-ops the file rather than
// failing).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const haveCreds = Boolean(url && serviceKey);

// One run-scoped tag so we can find and delete only the rows we wrote.
const RUN_TAG = `_verifier_test_${Date.now()}`;
const PROJECT_INSERT_ID = `${RUN_TAG}_insert`;
const PROJECT_UPDATE_ID = `${RUN_TAG}_update`;

// Use a loosely-typed client for these tests — Supabase's generated types
// for the pathfinder schema don't yet include the verifier columns added
// in 0005, and we want this test to validate that the *runtime* schema
// accepts the writes regardless of the static types. The `'pathfinder'`
// schema generic forces the createClient overload to match the
// `db: { schema: 'pathfinder' }` setting. Regenerate types post-merge
// with `npx supabase gen types typescript`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: SupabaseClient<any, 'pathfinder', any>;

describe.runIf(haveCreds)('verifier schema (0005_agent_expansion_layer1)', () => {
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase = createClient<any, 'pathfinder', any>(url!, serviceKey!, {
      db: { schema: 'pathfinder' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!supabase) return;
    // Clean up rows we inserted, in dependency order.
    await supabase.from('agent_log').delete().like('event_data->>tag', `${RUN_TAG}%`);
    await supabase.from('projects').delete().in('id', [PROJECT_INSERT_ID, PROJECT_UPDATE_ID]);
  });

  it('inserts a project with verified=true', async () => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        id: PROJECT_INSERT_ID,
        source: 'usaspending',
        source_id: PROJECT_INSERT_ID,
        title: 'verifier schema test · direct insert',
        verified: true,
        verifier_notes: 'inserted in passing state',
        verifier_pass_count: 1,
      })
      .select('id, verified, verifier_notes, verifier_pass_count')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.verified).toBe(true);
    expect(data?.verifier_notes).toBe('inserted in passing state');
    expect(data?.verifier_pass_count).toBe(1);
  });

  it('updates a project to verified=true, notes=passed all 4 checks, pass_count=1', async () => {
    // Seed: insert a row with verified=null (the realistic Ranker hand-off shape).
    const { error: insErr } = await supabase.from('projects').insert({
      id: PROJECT_UPDATE_ID,
      source: 'sam.gov',
      source_id: PROJECT_UPDATE_ID,
      title: 'verifier schema test · update path',
    });
    expect(insErr).toBeNull();

    // Update — what the live Verifier agent does on a pass verdict.
    const { data, error } = await supabase
      .from('projects')
      .update({
        verified: true,
        verifier_notes: 'passed all 4 checks',
        verifier_pass_count: 1,
      })
      .eq('id', PROJECT_UPDATE_ID)
      .select('id, verified, verifier_notes, verifier_pass_count')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.verified).toBe(true);
    expect(data?.verifier_notes).toBe('passed all 4 checks');
    expect(data?.verifier_pass_count).toBe(1);
  });

  it("agent_log accepts agent_name='verifier'", async () => {
    const { data, error } = await supabase
      .from('agent_log')
      .insert({
        agent_name: 'verifier',
        event_type: 'verify_pass',
        event_data: { tag: RUN_TAG, message: 'schema test · verifier accepted' },
      })
      .select('id, agent_name, event_type')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.agent_name).toBe('verifier');
    expect(data?.event_type).toBe('verify_pass');
  });

  it("agent_log rejects agent_name='not-a-real-agent'", async () => {
    const { error } = await supabase
      .from('agent_log')
      .insert({
        agent_name: 'not-a-real-agent',
        event_type: 'verify_pass',
        event_data: { tag: RUN_TAG, message: 'should be rejected by check constraint' },
      });

    expect(error).not.toBeNull();
    // PostgREST surfaces CHECK violations as PG error code 23514.
    expect(error?.code === '23514' || /agent_log_agent_name_check/.test(error?.message ?? '')).toBe(
      true,
    );
  });
});
