// lib/briefing.ts — Briefing payload builder + delivery orchestration.
//
// Lives outside `app/api/cron/briefing/route.ts` because Next.js App
// Router only allows specific named exports from route files. The cron
// handler + the test endpoint both import from here.

import { supabase } from '@/lib/supabase';
import {
  briefingToEmail,
  briefingToSlackBlocks,
  sendEmail,
  sendSlack,
  type BriefingMetric,
  type BriefingOpportunity,
  type BriefingPayload,
  type DeliveryResult,
} from '@/lib/notifications';
import { fetchActiveScoringConfig } from '@/lib/scoring-config-server';

const DASHBOARD_URL = 'https://pathfinder-ashy.vercel.app/pathfinder';
export const ORG_RECIPIENT = process.env.BRIEFING_ORG_EMAIL ?? 'kyle@demystified.ai';

// ────────────────────────────────────────────────────────────────────────
// agent_log helper
// ────────────────────────────────────────────────────────────────────────

type LogPayload = Record<string, unknown> & { message: string };

export async function writeBriefingLog(
  eventType: string,
  data: LogPayload,
): Promise<void> {
  // agent_log accepts our schema-prefix; supabase-js typings don't know
  // about the pathfinder enum'd `agent_name`. Loosely typed insert.
  const sb = supabase as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  try {
    await sb.from('agent_log').insert({
      agent_name: 'briefing',
      event_type: eventType,
      event_data: data,
    });
  } catch {
    // best-effort
  }
}

// ────────────────────────────────────────────────────────────────────────
// briefings table writes
// ────────────────────────────────────────────────────────────────────────

interface BriefingRow {
  id: number;
}

async function persistBriefing(args: {
  scope: 'org' | 'branch';
  branchId: string | null;
  payload: BriefingPayload;
  recipients: string[];
}): Promise<{ id: number | null; error?: string }> {
  const sb = supabase as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => Promise<{ data: BriefingRow[] | null; error: { message: string } | null }>;
      };
    };
  };
  try {
    const { data, error } = await sb
      .from('briefings')
      .insert({
        scope: args.scope,
        branch_id: args.branchId,
        brief_markdown:
          args.payload.statusStrip +
          '\n\n' +
          args.payload.opportunities.map((o) => `- ${o.title} (score ${o.score})`).join('\n'),
        metrics: {
          metrics: args.payload.metrics,
          opportunity_ids: args.payload.opportunities.map((o) => o.id),
        },
        recipients: args.recipients,
      })
      .select('id');
    if (error) return { id: null, error: error.message };
    return { id: data?.[0]?.id ?? null };
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function markBriefingDelivered(
  briefingId: number,
  recipients: string[],
): Promise<void> {
  const sb = supabase as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('briefings')
    .update({ delivered_at: new Date().toISOString(), recipients })
    .eq('id', briefingId);
}

// ────────────────────────────────────────────────────────────────────────
// Payload builder — queries last-7-day fleet state
// ────────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  title: string;
  source: string;
  score: number | null;
  rationale: string | null;
  project_value: number | null;
  distance_miles: number | null;
  ranked_at: string | null;
  ingested_at: string;
}

interface AgentRunRow {
  agent_name: string;
  records_processed: number | null;
  records_new: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export async function buildOrgBriefing(): Promise<BriefingPayload> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Top opportunities — top 3 ranked in the last week, falling back to
  // all-time top 3 if the week is empty.
  const { data: weekTop } = await supabase
    .from('projects')
    .select('id, title, source, score, rationale, project_value, distance_miles, ranked_at, ingested_at')
    .not('score', 'is', null)
    .gte('ranked_at', weekAgo)
    .order('score', { ascending: false })
    .limit(3);
  let topProjects = (weekTop ?? []) as ProjectRow[];
  if (topProjects.length === 0) {
    const { data: allTimeTop } = await supabase
      .from('projects')
      .select('id, title, source, score, rationale, project_value, distance_miles, ranked_at, ingested_at')
      .not('score', 'is', null)
      .order('score', { ascending: false })
      .limit(3);
    topProjects = (allTimeTop ?? []) as ProjectRow[];
  }

  const { data: thisWeekRuns } = await supabase
    .from('agent_runs')
    .select('agent_name, records_processed, records_new, status, started_at, completed_at')
    .gte('started_at', weekAgo);
  const { data: priorWeekRuns } = await supabase
    .from('agent_runs')
    .select('agent_name, records_processed, records_new, status, started_at, completed_at')
    .gte('started_at', twoWeeksAgo)
    .lt('started_at', weekAgo);

  const summarize = (rows: AgentRunRow[] | null) => {
    if (!rows) return { surfaced: 0, ranked: 0, errors: 0 };
    let surfaced = 0;
    let ranked = 0;
    let errors = 0;
    for (const r of rows) {
      if (r.agent_name === 'ingestor') surfaced += r.records_new ?? 0;
      if (r.agent_name === 'ranker') ranked += r.records_processed ?? 0;
      if (r.status === 'failed') errors += 1;
    }
    return { surfaced, ranked, errors };
  };
  const wk = summarize((thisWeekRuns ?? []) as AgentRunRow[]);
  const prev = summarize((priorWeekRuns ?? []) as AgentRunRow[]);

  const { count: totalTracked } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true });

  const { high_priority_threshold } = await fetchActiveScoringConfig();
  const { count: highPriCount } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .gte('score', high_priority_threshold);

  const { data: latestRunRows } = await supabase
    .from('agent_runs')
    .select('completed_at, started_at')
    .order('started_at', { ascending: false })
    .limit(1);
  const latestRun = (latestRunRows ?? []) as Array<{ completed_at: string | null; started_at: string }>;
  const lastRunIso = latestRun[0]?.completed_at ?? latestRun[0]?.started_at ?? null;
  const lastRunAgo = lastRunIso ? relativeAgo(lastRunIso) : '—';

  const { count: adjacentNew } = await supabase
    .from('adjacent_targets')
    .select('id', { count: 'exact', head: true })
    .gte('surfaced_at', weekAgo);

  const dateLabel = now.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const title = `Friday brief · ${dateLabel}`;
  const statusStrip = [
    `LAST RUN · ${lastRunAgo}`,
    `${totalTracked ?? 0} TRACKED`,
    `${wk.ranked} RANKED THIS WEEK`,
    `${highPriCount ?? 0} HIGH-PRIORITY`,
    `${wk.errors} ERRORS`,
  ].join(' | ');

  const metrics: BriefingMetric[] = [
    {
      label: 'Projects surfaced',
      value: String(wk.surfaced),
      delta: deltaLabel(wk.surfaced, prev.surfaced),
      trend: trendOf(wk.surfaced, prev.surfaced),
    },
    {
      label: 'Projects ranked',
      value: String(wk.ranked),
      delta: deltaLabel(wk.ranked, prev.ranked),
      trend: trendOf(wk.ranked, prev.ranked),
    },
    {
      label: 'High-priority',
      value: String(highPriCount ?? 0),
    },
    {
      label: 'Errors',
      value: String(wk.errors),
      delta: deltaLabel(wk.errors, prev.errors),
      // inverted: fewer errors than prior week is "good" → up arrow
      trend: trendOf(prev.errors, wk.errors),
    },
  ];

  const opportunities: BriefingOpportunity[] = topProjects.map((p) => ({
    id: p.id,
    title: p.title,
    source: p.source,
    value: formatValue(p.project_value),
    distance: p.distance_miles != null ? `${p.distance_miles.toFixed(1)}mi` : '—',
    score: p.score ?? 0,
    rationale: (p.rationale ?? '').slice(0, 220),
    high_priority: (p.score ?? 0) >= high_priority_threshold,
  }));

  return {
    scope: 'org',
    title,
    recipient: 'Kyle Doenz',
    statusStrip,
    metrics,
    opportunities,
    adjacentDigest:
      (adjacentNew ?? 0) > 0
        ? `Adjacent agent surfaced ${adjacentNew} next-customer candidates this week. View all in dashboard.`
        : undefined,
    dashboardUrl: DASHBOARD_URL,
  };
}

function deltaLabel(now: number, prior: number): string | undefined {
  if (prior === 0 && now === 0) return undefined;
  const diff = now - prior;
  if (diff === 0) return undefined;
  return diff > 0 ? `+${diff}` : `${diff}`;
}
function trendOf(now: number, prior: number): 'up' | 'down' | undefined {
  if (now === prior) return undefined;
  return now > prior ? 'up' : 'down';
}
function formatValue(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function relativeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ────────────────────────────────────────────────────────────────────────
// Delivery — fan-out to email + Slack, log each result, mark delivered
// ────────────────────────────────────────────────────────────────────────

export async function deliverBriefing(payload: BriefingPayload): Promise<{
  email: DeliveryResult;
  slack: DeliveryResult;
  briefing_id: number | null;
}> {
  const recipients: string[] = [];
  if (process.env.RESEND_FROM_EMAIL) recipients.push(`email:${ORG_RECIPIENT}`);
  if (process.env.SLACK_WEBHOOK_URL) recipients.push('slack:webhook');

  const { id: briefing_id, error: persistError } = await persistBriefing({
    scope: payload.scope,
    branchId: null,
    payload,
    recipients,
  });
  if (persistError) {
    await writeBriefingLog('error', { message: 'briefing persist failed', reason: persistError });
  }

  const emailContent = briefingToEmail(payload);
  const emailResult = await sendEmail({
    to: ORG_RECIPIENT,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });
  await writeBriefingLog(emailResult.ok ? 'delivery_success' : 'delivery_failure', {
    message: emailResult.ok
      ? `email delivered to ${emailResult.recipient ?? ORG_RECIPIENT}`
      : `email failed: ${emailResult.error ?? 'unknown'}`,
    channel: 'email',
    recipient: emailResult.recipient ?? ORG_RECIPIENT,
    message_id: emailResult.message_id,
    briefing_id,
  });

  const blocks = briefingToSlackBlocks(payload);
  const slackResult = await sendSlack({ text: payload.title, blocks });
  await writeBriefingLog(slackResult.ok ? 'delivery_success' : 'delivery_failure', {
    message: slackResult.ok ? 'slack delivered' : `slack failed: ${slackResult.error ?? 'unknown'}`,
    channel: 'slack',
    briefing_id,
  });

  if (briefing_id && (emailResult.ok || slackResult.ok)) {
    const delivered: string[] = [];
    if (emailResult.ok) delivered.push(`email:${emailResult.recipient ?? ORG_RECIPIENT}`);
    if (slackResult.ok) delivered.push('slack:webhook');
    await markBriefingDelivered(briefing_id, delivered);
  }

  return { email: emailResult, slack: slackResult, briefing_id };
}
