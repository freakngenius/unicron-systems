// services/briefer/agent.ts — Demo Polish UX Gate 13W-A.
//
// composeDailyBrief — given a user_id and a "now", compose the daily
// intelligence brief: top 5 new leads, follow-ups due, deal stage
// transitions, replies received, contacts pending review.
//
// Pure orchestrator: it loads prefs, calls the per-section fetchers in
// parallel, and renders. The cron in 13W-B wraps this with the send.
// The settings page in 13W-C wraps it with a "preview last brief" UI.
//
// LLM mode in v1 is template-only per the gate prompt
// ("Anthropic Sonnet for narrative synthesis (optional; can be
// template-only for v1)"). The 'sonnet' branch passes through to the
// template output and stamps llm_cost_usd: 0; full LLM synthesis lands
// post-gate-13W when we have data on what operators actually skim.

import { supabaseAdmin } from '@/lib/supabase';
import {
  DEFAULT_BRIEFING_PREFS,
  type BriefingPrefs,
  type BriefingSections,
  type DailyBrief,
  type DailyBriefMetrics,
} from '@/lib/types';

import {
  fetchContactsPending,
  fetchFollowUps,
  fetchNewLeads,
  fetchReplies,
  fetchStageChanges,
  renderContactsPending,
  renderFollowUps,
  renderNewLeads,
  renderReplies,
  renderStageChanges,
  type BrieferClient,
  type ContactPendingRow,
  type FollowUpRow,
  type NewLeadRow,
  type ReplyRow,
  type StageChangeRow,
} from './sections';
import { buildSubject, formatLocalDate, markdownToHtml } from './render';

// Section fetchers are pluggable so tests can stub them without spinning
// up a Supabase fixture. The default uses the live functions in
// sections.ts.
export interface SectionFetchers {
  newLeads: (
    client: BrieferClient,
    args: { now: Date; limit?: number },
  ) => Promise<NewLeadRow[]>;
  followUps: (
    client: BrieferClient,
    args: { now: Date; userId: string; staleAfterDays?: number },
  ) => Promise<FollowUpRow[]>;
  stageChanges: (
    client: BrieferClient,
    args: { now: Date; userId: string },
  ) => Promise<StageChangeRow[]>;
  replies: (
    client: BrieferClient,
    args: { now: Date; userId: string },
  ) => Promise<ReplyRow[]>;
  contactsPending: (
    client: BrieferClient,
    args: { now: Date; userId: string },
  ) => Promise<ContactPendingRow[]>;
}

const DEFAULT_FETCHERS: SectionFetchers = {
  newLeads: fetchNewLeads,
  followUps: fetchFollowUps,
  stageChanges: fetchStageChanges,
  replies: fetchReplies,
  contactsPending: fetchContactsPending,
};

export interface ComposeDailyBriefInput {
  userId: string;
  now: Date;
  // Optional override; loadPrefs() is used when omitted.
  prefs?: BriefingPrefs;
  // Optional client override (tests).
  db?: BrieferClient;
  // Optional fetcher override (tests).
  fetchers?: Partial<SectionFetchers>;
  // Optional base URL override; defaults to env / production fallback.
  baseUrl?: string;
  // Optional LLM mode. v1 only honors 'template' meaningfully.
  llm?: 'template' | 'sonnet';
}

export async function composeDailyBrief(
  input: ComposeDailyBriefInput,
): Promise<DailyBrief> {
  const db: BrieferClient = input.db ?? (supabaseAdmin() as unknown as BrieferClient);
  const prefs = input.prefs ?? (await loadPrefs(db, input.userId));
  const sections = mergeSections(prefs.sections);
  const fetchers: SectionFetchers = { ...DEFAULT_FETCHERS, ...(input.fetchers ?? {}) };
  const baseUrl =
    input.baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://pathfinder.unicron.systems';

  // Run enabled sections in parallel; disabled sections short-circuit
  // to empty arrays so the metrics object always has all five counts.
  const [newLeads, followUps, stageChanges, replies, contactsPending] = await Promise.all([
    sections.new_leads
      ? fetchers.newLeads(db, { now: input.now })
      : Promise.resolve<NewLeadRow[]>([]),
    sections.follow_ups
      ? fetchers.followUps(db, { now: input.now, userId: input.userId })
      : Promise.resolve<FollowUpRow[]>([]),
    sections.stage_changes
      ? fetchers.stageChanges(db, { now: input.now, userId: input.userId })
      : Promise.resolve<StageChangeRow[]>([]),
    sections.replies
      ? fetchers.replies(db, { now: input.now, userId: input.userId })
      : Promise.resolve<ReplyRow[]>([]),
    sections.contacts_pending
      ? fetchers.contactsPending(db, { now: input.now, userId: input.userId })
      : Promise.resolve<ContactPendingRow[]>([]),
  ]);

  const metrics: DailyBriefMetrics = {
    new_leads_count: newLeads.length,
    follow_ups_count: followUps.length,
    stage_changes_count: stageChanges.length,
    replies_count: replies.length,
    contacts_pending_count: contactsPending.length,
    llm_cost_usd: 0,
  };

  const date = formatLocalDate(input.now, prefs.timezone);
  const greeting = `# Pathfinder daily brief — ${date}\n\nGood morning. Here's what changed in the last 24 hours.`;

  const blocks: string[] = [greeting];
  const rendered: Array<keyof BriefingSections> = [];

  if (sections.new_leads) {
    blocks.push(renderNewLeads(newLeads, baseUrl));
    if (newLeads.length > 0) rendered.push('new_leads');
  }
  if (sections.follow_ups) {
    blocks.push(renderFollowUps(followUps, baseUrl, input.now));
    if (followUps.length > 0) rendered.push('follow_ups');
  }
  if (sections.stage_changes) {
    blocks.push(renderStageChanges(stageChanges, baseUrl));
    if (stageChanges.length > 0) rendered.push('stage_changes');
  }
  if (sections.replies) {
    blocks.push(renderReplies(replies, baseUrl));
    if (replies.length > 0) rendered.push('replies');
  }
  if (sections.contacts_pending) {
    blocks.push(renderContactsPending(contactsPending, baseUrl));
    if (contactsPending.length > 0) rendered.push('contacts_pending');
  }

  blocks.push(
    `---\n\nSent by Pathfinder. Manage your daily brief at ${baseUrl.replace(/\/+$/, '')}/pathfinder/settings/briefing.`,
  );

  const markdown = blocks.join('\n\n');
  const html = markdownToHtml(markdown);
  const subject = buildSubject({
    date,
    newLeadsCount: metrics.new_leads_count,
    followUpsCount: metrics.follow_ups_count,
  });

  return {
    subject,
    markdown,
    html,
    metrics,
    sections_rendered: rendered,
  };
}

// loadPrefs — return the row for user_id, falling back to the table
// default when no row exists. Mirrors the column defaults in
// migration 0122_briefing_prefs.sql.
export async function loadPrefs(
  client: BrieferClient,
  userId: string,
): Promise<BriefingPrefs> {
  const res = await client
    .from('briefing_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (res.error) {
    throw new Error(`loadPrefs failed for ${userId}: ${res.error.message}`);
  }
  if (!res.data) {
    return {
      user_id: userId,
      ...DEFAULT_BRIEFING_PREFS,
      // Defaults are stamped at compose time; the row is never persisted
      // here. Empty timestamps signal "default, not yet saved".
      created_at: '',
      updated_at: '',
    };
  }
  // Normalize jsonb sections — older rows might be missing keys; treat
  // missing as opt-in (true).
  return {
    ...res.data,
    sections: mergeSections(res.data.sections ?? {}),
  } as BriefingPrefs;
}

function mergeSections(s: Partial<BriefingSections>): BriefingSections {
  return {
    new_leads: s.new_leads ?? true,
    follow_ups: s.follow_ups ?? true,
    stage_changes: s.stage_changes ?? true,
    replies: s.replies ?? true,
    contacts_pending: s.contacts_pending ?? true,
  };
}

export const __test__ = {
  mergeSections,
};
