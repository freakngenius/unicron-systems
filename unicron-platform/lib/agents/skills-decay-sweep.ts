// lib/agents/skills-decay-sweep.ts — Sprint 9 Stream A
//
// Skills procedural-memory decay sweep. Runs nightly alongside the Analyst
// decayTick. Retires approved Skills whose last_run_at is older than the
// configured decay interval:
//
//   - Per-tenant Skills (customer_id IS NOT NULL): 90 days default
//   - System Skills    (customer_id IS NULL):     180 days default
//   - decay_at on the Skill row overrides both defaults when set.
//
// Mutation: lifecycle_status flips 'approved' → 'retired'. Retired rows stay
// in the table for audit + lineage; the Library tab hides them by default.
// The taboo write trigger (nervous_system.skills_require_taboo_check) treats
// approved → retired with no other procedural-field change as the one allowed
// semantic mutation without a taboo_check_id (see migration §8).
//
// First run emits an audit_log row + one-line summary to the
// SLACK_FEED_CHANNEL_ID (#orchestrator-feed) via the same chat.postMessage
// helper janitor.ts uses.
//
// Sink: nervous_system.audit_log row action='skills_decay_sweep_complete'.
//
// Note on file location: registered alongside the existing Analyst Inngest
// functions in lib/agents/inngest-fns.ts. The Sprint 9 brief mentioned
// src/lib/inngest/ as a candidate path but that directory does not exist in
// the live unicron-platform tree — the live convention is lib/agents/ for
// every Inngest-backed worker (analyst, janitor, curator, boundary, etc.).

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SLACK_FEED_CHANNEL_ID = process.env.SLACK_FEED_CHANNEL_ID;
const SLACK_TOKEN           = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;

const SYSTEM_DECAY_DAYS  = 180;
const TENANT_DECAY_DAYS  = 90;

interface SkillRow {
  id: string;
  name: string;
  customer_id: string | null;
  last_run_at: string | null;
  decay_at: string | null;
  registered_at: string | null;
  lifecycle_status: string;
}

export interface SkillsDecaySweepResult {
  scanned: number;
  retired: number;
  retired_ids: string[];
  slack_posted: boolean;
  audit_log_id: string | null;
  sample: Array<{ id: string; name: string; reason: string }>;
}

async function slackPost(channelId: string, text: string): Promise<boolean> {
  if (!SLACK_TOKEN) return false;
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      console.error(`[skills-decay-sweep] slack post failed: ${body.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      '[skills-decay-sweep] slack post threw:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

function isStale(row: SkillRow, now: Date): { stale: boolean; reason: string } {
  // 1. Explicit per-Skill decay_at overrides everything.
  if (row.decay_at) {
    const decayAt = new Date(row.decay_at).getTime();
    if (decayAt < now.getTime()) {
      return { stale: true, reason: `decay_at=${row.decay_at} elapsed` };
    }
    return { stale: false, reason: 'decay_at in future' };
  }

  // 2. Fall back to "time since last activity" — last_run_at if set,
  //    otherwise registered_at as the anchor.
  const anchor = row.last_run_at ?? row.registered_at;
  if (!anchor) {
    return { stale: false, reason: 'no anchor timestamp' };
  }

  const decayDays = row.customer_id == null ? SYSTEM_DECAY_DAYS : TENANT_DECAY_DAYS;
  const ageMs     = now.getTime() - new Date(anchor).getTime();
  const ageDays   = ageMs / (24 * 3600 * 1000);

  if (ageDays > decayDays) {
    return {
      stale: true,
      reason: `${ageDays.toFixed(1)}d since ${row.last_run_at ? 'last_run_at' : 'registered_at'} (> ${decayDays}d ${row.customer_id == null ? 'system' : 'tenant'} default)`,
    };
  }

  return { stale: false, reason: `${ageDays.toFixed(1)}d / ${decayDays}d budget` };
}

export async function skillsDecaySweep(): Promise<SkillsDecaySweepResult> {
  const now = new Date();
  console.log('[skills-decay-sweep] starting');

  // Pull every approved Skill. Even at 10K rows this is cheap; we do not
  // need to push the threshold into SQL because the threshold depends on
  // customer_id vs decay_at vs anchor selection.
  const { data, error } = await supabase
    .schema('nervous_system')
    .from('skills')
    .select('id, name, customer_id, last_run_at, decay_at, registered_at, lifecycle_status')
    .eq('lifecycle_status', 'approved');

  if (error) {
    console.error('[skills-decay-sweep] read error:', error.message);
    return {
      scanned: 0,
      retired: 0,
      retired_ids: [],
      slack_posted: false,
      audit_log_id: null,
      sample: [],
    };
  }

  const rows         = (data ?? []) as SkillRow[];
  const retired_ids: string[] = [];
  const sample: Array<{ id: string; name: string; reason: string }> = [];

  for (const row of rows) {
    const verdict = isStale(row, now);
    if (!verdict.stale) continue;

    // Decay path: approved → retired. The migration's taboo-check trigger
    // exempts this exact transition when no other procedural field moves.
    const { error: upErr } = await supabase
      .schema('nervous_system')
      .from('skills')
      .update({ lifecycle_status: 'retired' })
      .eq('id', row.id)
      .eq('lifecycle_status', 'approved');

    if (upErr) {
      console.error(`[skills-decay-sweep] retire ${row.id} failed: ${upErr.message}`);
      continue;
    }

    retired_ids.push(row.id);
    if (sample.length < 10) {
      sample.push({ id: row.id, name: row.name, reason: verdict.reason });
    }
  }

  // Audit log row
  let audit_log_id: string | null = null;
  try {
    const { data: auditRow, error: auditErr } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.skills',
        action: 'skills_decay_sweep_complete',
        payload: {
          run_at: now.toISOString(),
          scanned: rows.length,
          retired: retired_ids.length,
          retired_ids,
          sample,
          system_decay_days: SYSTEM_DECAY_DAYS,
          tenant_decay_days: TENANT_DECAY_DAYS,
        },
      })
      .select('id')
      .single();
    if (auditErr) {
      console.error('[skills-decay-sweep] audit_log insert:', auditErr.message);
    } else if (auditRow) {
      audit_log_id = (auditRow as { id: string }).id;
    }
  } catch (err) {
    console.error(
      '[skills-decay-sweep] audit_log insert threw:',
      err instanceof Error ? err.message : err,
    );
  }

  // Slack one-liner — only when something happened or env is wired.
  let slack_posted = false;
  if (SLACK_FEED_CHANNEL_ID && retired_ids.length > 0) {
    const date = now.toISOString().split('T')[0];
    const top  = sample.slice(0, 3).map((s) => `\`${s.name}\``).join(', ');
    const tail = retired_ids.length > 3 ? ` (+${retired_ids.length - 3} more)` : '';
    const msg  = `:zzz: *Skills decay sweep ${date}* — retired ${retired_ids.length} of ${rows.length} approved Skills: ${top}${tail}`;
    slack_posted = await slackPost(SLACK_FEED_CHANNEL_ID, msg);
  }

  console.log(
    `[skills-decay-sweep] done: scanned=${rows.length} retired=${retired_ids.length} slack=${slack_posted}`,
  );

  return {
    scanned: rows.length,
    retired: retired_ids.length,
    retired_ids,
    slack_posted,
    audit_log_id,
    sample,
  };
}
