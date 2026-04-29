// lib/slack/alerts.ts — high-priority alert detection + delivery.
//
// Driven by /api/cron/slack-alerts on a 10-minute Vercel cron. For each
// project that's:
//
//   • verified = true
//   • score   ≥ 90
//   • posted_date IS NOT NULL AND now - posted_date < 60 days
//        (v1 proxy for "RFP window < 60 days"; see PLAN-P0-04-SLACK §3 D6 —
//         this captures FRESH projects, not IMMINENT-RFP. Refine the proxy
//         to "posted_date between 30 and 75 days ago" once we have Zedcor
//         accept-rate data telling us which framing matches their pipeline.)
//   • not posted to Slack in the last 7 days (slack_messages dedup)
//
// …we look up the routing for the project's nearest_branch in the
// workspace, post the lead message (DM if a rep_user_id is configured;
// channel post with `<!here>` otherwise), persist a slack_messages row,
// and stamp projects.slack_alert_sent_at.
//
// Snoozes from any rep on the project suppress the alert until their
// snooze window elapses. Duration parsed from the lead_actions.note
// string ('snoozed 24h via slack' → 24h, 'snoozed 7d via slack' → 7d).

import { publicUrl } from '@/lib/public-url';
import { supabaseAdmin } from '@/lib/supabase';
import { auditSlack, getClient, getWorkspace } from '@/lib/slack/bot';
import { buildLeadMessage } from '@/lib/slack/messages';
import type {
  Branch,
  LeadAction,
  Project,
  SlackBranchRoute,
  SlackMessageKind,
} from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export interface SlackAlertsRunResult {
  scanned: number;
  posted: number;
  skipped_no_route: number;
  skipped_snoozed: number;
  skipped_already_posted: number;
  errors: number;
}

const CANDIDATE_LIMIT = 50;

export async function runSlackAlerts(): Promise<SlackAlertsRunResult> {
  const startedAt = Date.now();
  const result: SlackAlertsRunResult = {
    scanned: 0,
    posted: 0,
    skipped_no_route: 0,
    skipped_snoozed: 0,
    skipped_already_posted: 0,
    errors: 0,
  };

  const candidates = await loadCandidates();
  result.scanned = candidates.length;

  for (const project of candidates) {
    try {
      const outcome = await processCandidate(project);
      switch (outcome) {
        case 'posted':
          result.posted += 1;
          break;
        case 'no_route':
          result.skipped_no_route += 1;
          break;
        case 'snoozed':
          result.skipped_snoozed += 1;
          break;
        case 'already_posted':
          result.skipped_already_posted += 1;
          break;
      }
    } catch (e) {
      result.errors += 1;
      const reason = e instanceof Error ? e.message : String(e);
      await auditSlack('alert_failed', {
        message: 'alert dispatch threw',
        project_id: project.id,
        reason,
      });
    }
  }

  await auditSlack('alerts_cycle', {
    message: 'slack alerts cycle complete',
    latency_ms: Date.now() - startedAt,
    ...result,
  });
  return result;
}

// ────────────────────────────────────────────────────────────────────────
// Candidate selection
// ────────────────────────────────────────────────────────────────────────

async function loadCandidates(): Promise<Project[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: boolean) => {
          gte: (col: string, val: number) => {
            gte: (col: string, val: string) => {
              not: (col: string, op: string, val: null) => {
                or: (filter: string) => {
                  order: (col: string, opts: { ascending: boolean }) => {
                    limit: (n: number) => Promise<{
                      data: Record<string, unknown>[] | null;
                      error: { message: string } | null;
                    }>;
                  };
                };
              };
            };
          };
        };
      };
    };
  };

  // 60-day freshness window — v1 proxy for "RFP window < 60 days."
  const sixtyDaysAgo = isoDateNDaysAgo(60);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const r = await sb
    .from('projects')
    .select('*')
    .eq('verified', true)
    .gte('score', 90)
    .gte('posted_date', sixtyDaysAgo)
    .not('nearest_branch_id', 'is', null)
    .or(`slack_alert_sent_at.is.null,slack_alert_sent_at.lt.${sevenDaysAgo}`)
    .order('score', { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (r.error || !r.data) return [];
  return r.data as unknown as Project[];
}

function isoDateNDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────
// Per-candidate processing
// ────────────────────────────────────────────────────────────────────────

type CandidateOutcome = 'posted' | 'no_route' | 'snoozed' | 'already_posted';

async function processCandidate(project: Project): Promise<CandidateOutcome> {
  // 1. Check snooze suppression first (cheapest skip).
  if (await isProjectSnoozed(project.id)) {
    await stampAlertSent(project.id); // suppress for the TTL window — don't re-check next tick
    return 'snoozed';
  }

  // 2. Find route(s). For v1 we route to the project's nearest branch
  //    in any installed workspace that has a route mapped for it. The
  //    Zedcor pilot has one workspace; multi-tenant uses iterate over
  //    all installs.
  const routes = await loadRoutesForBranch(project.nearest_branch_id!);
  if (routes.length === 0) {
    return 'no_route';
  }

  let posted = false;
  for (const route of routes) {
    // 3. Per-route dedup against slack_messages.
    if (await hasRecentSlackMessage(project.id, route.team_id, 7)) {
      continue;
    }

    const ws = await getWorkspace(route.team_id);
    if (!ws) continue;

    const branchName = await loadBranchName(project.nearest_branch_id!);
    const dashboardUrl = `${publicUrl()}/projects/${project.id}`;

    const useDM = Boolean(route.rep_user_id);
    const channelId = useDM ? await openIm(route.team_id, route.rep_user_id!) : route.channel_id;
    if (!channelId) continue;

    const lead = buildLeadMessage({
      project,
      branchName,
      mentionHere: !useDM, // channel posts ping <!here>; DMs do not
      slackMessagesId: 0, // placeholder; we rewrite blocks after persisting the row
      dashboardUrl,
    });

    // Post the message first; we need the ts to persist the slack_messages row.
    let ts: string | null = null;
    try {
      const client = await getClient(route.team_id);
      const res = await client.chat.postMessage({
        channel: channelId,
        text: lead.text,
        blocks: lead.blocks as unknown as never[],
      });
      ts = (res.ts as string | undefined) ?? null;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await auditSlack('post_failed', {
        message: 'chat.postMessage failed',
        project_id: project.id,
        team_id: route.team_id,
        channel_id: channelId,
        reason,
      });
      continue; // try the next route
    }
    if (!ts) continue;

    // Persist the slack_messages row, then re-render with the row id
    // baked into the action button values + chat.update.
    const kind: SlackMessageKind = useDM ? 'high_priority_dm' : 'high_priority_post';
    const messageRowId = await persistSlackMessage({
      teamId: route.team_id,
      channelId,
      ts,
      projectId: project.id,
      kind,
    });
    if (messageRowId == null) {
      // Couldn't persist; the message is live but we can't track its
      // resolved state. Audit + continue. No re-post; next tick sees
      // a recent slack_messages row absent but a posted_message
      // present in Slack — so we'll potentially re-post in 10 min.
      // Acceptable v1 trade-off; logged for follow-up.
      await auditSlack('persist_message_failed', {
        message: 'posted to Slack but failed to persist slack_messages row',
        project_id: project.id,
        team_id: route.team_id,
        channel_id: channelId,
        ts,
      });
      continue;
    }

    // Re-render with the real row id and update in place.
    const finalLead = buildLeadMessage({
      project,
      branchName,
      mentionHere: !useDM,
      slackMessagesId: messageRowId,
      dashboardUrl,
    });
    try {
      const client = await getClient(route.team_id);
      await client.chat.update({
        channel: channelId,
        ts,
        text: finalLead.text,
        blocks: finalLead.blocks as unknown as never[],
      });
    } catch (e) {
      // Non-fatal; the original message is up. Buttons may still work
      // because action.value carries pid+smid=0 — the dispatcher will
      // still upsert via lead-actions, just can't isolate to one row
      // for resolved-state tracking. We log this for follow-up.
      const reason = e instanceof Error ? e.message : String(e);
      await auditSlack('chat_update_with_id_failed', {
        message: 'chat.update with persisted row id failed; original message remains',
        project_id: project.id,
        ts,
        reason,
      });
    }

    posted = true;
    await auditSlack('alert_posted', {
      message: 'high-priority alert posted',
      project_id: project.id,
      team_id: route.team_id,
      channel_id: channelId,
      kind,
      score: project.score,
    });
  }

  if (!posted) {
    return 'already_posted';
  }

  await stampAlertSent(project.id);
  return 'posted';
}

// ────────────────────────────────────────────────────────────────────────
// Snooze check — read most recent lead_actions row for the project
// ────────────────────────────────────────────────────────────────────────

const SNOOZE_DURATIONS_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

function snoozeDurationFromNote(note: string | null | undefined): number {
  if (!note) return SNOOZE_DURATIONS_MS['24h']; // default per snoozeDurationFromNote rule
  if (note.includes('7d')) return SNOOZE_DURATIONS_MS['7d'];
  return SNOOZE_DURATIONS_MS['24h'];
}

async function isProjectSnoozed(projectId: string): Promise<boolean> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{
                data: Record<string, unknown>[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };

  const r = await sb
    .from('lead_actions')
    .select('updated_at, note')
    .eq('project_id', projectId)
    .eq('status', 'snoozed')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (r.error || !r.data || r.data.length === 0) return false;
  const row = r.data[0] as unknown as Pick<LeadAction, 'updated_at' | 'note'>;
  const snoozedAtMs = new Date(row.updated_at).getTime();
  const dur = snoozeDurationFromNote(row.note);
  return snoozedAtMs + dur > Date.now();
}

// ────────────────────────────────────────────────────────────────────────
// Routing + workspace helpers
// ────────────────────────────────────────────────────────────────────────

async function loadRoutesForBranch(branchId: string): Promise<SlackBranchRoute[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const r = await sb.from('slack_branch_routes').select('*').eq('branch_id', branchId);
  if (r.error || !r.data) return [];
  return r.data as unknown as SlackBranchRoute[];
}

async function loadBranchName(branchId: string): Promise<string | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const r = await sb.from('branches').select('*').eq('id', branchId).maybeSingle();
  if (r.error || !r.data) return null;
  return ((r.data as unknown) as Branch).name ?? null;
}

async function hasRecentSlackMessage(
  projectId: string,
  teamId: string,
  daysWindow: number,
): Promise<boolean> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            gt: (col: string, val: string) => {
              limit: (n: number) => Promise<{
                data: Record<string, unknown>[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
  const cutoff = new Date(Date.now() - daysWindow * 24 * 3600 * 1000).toISOString();
  const r = await sb
    .from('slack_messages')
    .select('id')
    .eq('project_id', projectId)
    .eq('team_id', teamId)
    .gt('posted_at', cutoff)
    .limit(1);
  if (r.error || !r.data) return false;
  return r.data.length > 0;
}

interface PersistMessageArgs {
  teamId: string;
  channelId: string;
  ts: string;
  projectId: string;
  kind: SlackMessageKind;
}

async function persistSlackMessage(args: PersistMessageArgs): Promise<number | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const r = await sb
    .from('slack_messages')
    .insert({
      team_id: args.teamId,
      channel_id: args.channelId,
      ts: args.ts,
      project_id: args.projectId,
      kind: args.kind,
    })
    .select('id');
  if (r.error || !r.data || r.data.length === 0) return null;
  return ((r.data[0] as unknown) as { id: number }).id;
}

async function stampAlertSent(projectId: string): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('projects')
    .update({ slack_alert_sent_at: new Date().toISOString() })
    .eq('id', projectId);
}

async function openIm(teamId: string, userId: string): Promise<string | null> {
  try {
    const client = await getClient(teamId);
    const res = await client.conversations.open({ users: userId });
    const channelId = (res.channel as { id?: string } | undefined)?.id;
    return channelId ?? null;
  } catch (e) {
    await auditSlack('im_open_failed', {
      message: 'conversations.open failed',
      team_id: teamId,
      user_id: userId,
      reason: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
