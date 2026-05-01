// lib/timeline.ts — Stream B Gate B3.
//
// Server-side aggregator that collates per-lead activity events from
// across the Pathfinder schema into a single chronologically-ordered
// list. Used by GET /api/projects/[id]/timeline and the Lead Detail
// timeline UI.
//
// Sources collected:
//   - projects.ingested_at        → 'ingestion'
//   - projects.ranked_at          → 'scored'
//   - projects.verifier_notes     → 'verified' (when verified=true)
//   - outreach_drafts             → 'outreach_drafted'
//   - outreach_edits              → 'email_sent' or 'send_failed'
//   - email_threads               → 'reply_received' (one per thread on
//                                   first replied_at)
//   - deal_activities             → forwards activity_type
//   - lead_actions                → 'lead_action' (status pivot)

import { supabase } from '@/lib/supabase';
import type {
  DealActivity,
  EmailThread,
  LeadAction,
  OutreachDraft,
  OutreachEdit,
  Project,
} from '@/lib/types';

export type TimelineEventKind =
  | 'ingestion'
  | 'scored'
  | 'verified'
  | 'outreach_drafted'
  | 'email_sent'
  | 'send_failed'
  | 'reply_received'
  | 'stage_change'
  | 'meeting_booked'
  | 'manual_note'
  | 'lead_action';

export interface TimelineEvent {
  id: string;
  ts: string; // ISO8601 timestamp
  kind: TimelineEventKind;
  // One-line label for quick render. Detail strings live in `detail`.
  title: string;
  detail: string | null;
  source_table: string;
  source_id: string | null;
  // Free-form payload for the UI to render (sender, recipient, edit
  // distance, draft channel, etc.).
  payload: Record<string, unknown>;
}

export async function buildTimelineForProject(
  projectId: string,
): Promise<TimelineEvent[]> {
  // Run all reads in parallel — they're independent.
  const [
    projectRes,
    draftsRes,
    editsRes,
    threadsRes,
    dealActivitiesRes,
    leadActionsRes,
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    supabase
      .from('outreach_drafts')
      .select('*')
      .eq('project_id', projectId)
      .order('draft_at', { ascending: true }),
    supabase
      .from('outreach_edits')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('email_threads')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: true }),
    supabase
      .from('deals')
      .select('id, deal_activities(*)')
      .eq('project_id', projectId),
    supabase
      .from('lead_actions')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: true }),
  ]);

  const events: TimelineEvent[] = [];

  const project = (projectRes.data as Project | null) ?? null;
  if (project) {
    events.push({
      id: `ingest:${project.id}`,
      ts: project.ingested_at,
      kind: 'ingestion',
      title: 'Project ingested',
      detail: `Source: ${project.source}${project.posted_date ? ` · posted ${project.posted_date}` : ''}`,
      source_table: 'projects',
      source_id: project.id,
      payload: {
        source: project.source,
        title: project.title,
        project_value: project.project_value,
      },
    });
    if (project.ranked_at && typeof project.score === 'number') {
      events.push({
        id: `scored:${project.id}`,
        ts: project.ranked_at,
        kind: 'scored',
        title: `Ranked · score ${project.score}`,
        detail: project.outreach_hook ?? null,
        source_table: 'projects',
        source_id: project.id,
        payload: { score: project.score },
      });
    }
    if (project.verified === true && project.ranked_at) {
      events.push({
        id: `verified:${project.id}`,
        ts: project.ranked_at, // approximate — verifier doesn't timestamp separately
        kind: 'verified',
        title: 'Verified',
        detail: project.verifier_notes ?? null,
        source_table: 'projects',
        source_id: project.id,
        payload: { verifier_pass_count: project.verifier_pass_count ?? null },
      });
    }
  }

  for (const d of (draftsRes.data ?? []) as OutreachDraft[]) {
    events.push({
      id: `draft:${d.id}`,
      ts: d.draft_at,
      kind: 'outreach_drafted',
      title: `Outreach drafted · ${d.channel}`,
      detail: d.draft_subject ?? d.draft_body.slice(0, 80),
      source_table: 'outreach_drafts',
      source_id: String(d.id),
      payload: {
        channel: d.channel,
        word_count: d.word_count,
        warm_intro_via: d.warm_intro_via,
      },
    });
  }

  for (const e of (editsRes.data ?? []) as OutreachEdit[]) {
    events.push({
      id: `edit:${e.id}`,
      ts: e.sent_at ?? e.created_at,
      kind: e.send_error ? 'send_failed' : 'email_sent',
      title: e.send_error ? `Send failed (${e.provider})` : `Email sent via ${e.provider}`,
      detail: e.sent_subject ?? e.send_error ?? null,
      source_table: 'outreach_edits',
      source_id: e.id,
      payload: {
        provider: e.provider,
        recipient: e.recipient_email,
        edit_distance: e.edit_distance,
        provider_message_id: e.provider_message_id,
        provider_thread_id: e.provider_thread_id,
        send_error: e.send_error,
      },
    });
  }

  for (const t of (threadsRes.data ?? []) as EmailThread[]) {
    if (t.replied_at) {
      events.push({
        id: `reply:${t.id}`,
        ts: t.replied_at,
        kind: 'reply_received',
        title: `Reply received (${t.provider})`,
        detail: t.subject ?? null,
        source_table: 'email_threads',
        source_id: t.id,
        payload: {
          provider: t.provider,
          provider_thread_id: t.provider_thread_id,
          recipient: t.recipient_email,
        },
      });
    }
  }

  // deal_activities returned via the embedded select.
  type DealsSelect = { id: string; deal_activities?: DealActivity[] };
  for (const d of (dealActivitiesRes.data ?? []) as unknown as DealsSelect[]) {
    for (const act of d.deal_activities ?? []) {
      // Skip reply_received here — we already emit it from email_threads
      // (preferred source because it carries thread metadata).
      if (act.activity_type === 'reply_received') continue;
      const kind: TimelineEventKind =
        act.activity_type === 'stage_change'
          ? 'stage_change'
          : act.activity_type === 'meeting_booked'
            ? 'meeting_booked'
            : act.activity_type === 'manual_note'
              ? 'manual_note'
              : 'stage_change';
      events.push({
        id: `dealact:${act.id}`,
        ts: act.created_at,
        kind,
        title:
          act.activity_type === 'stage_change'
            ? `Deal moved · ${act.from_stage ?? '—'} → ${act.to_stage ?? '—'}`
            : act.activity_type === 'meeting_booked'
              ? 'Meeting booked'
              : 'Note added',
        detail: act.actor_email ?? null,
        source_table: 'deal_activities',
        source_id: act.id,
        payload: {
          deal_id: act.deal_id,
          from_stage: act.from_stage,
          to_stage: act.to_stage,
          ...(act.payload ?? {}),
        },
      });
    }
  }

  for (const a of (leadActionsRes.data ?? []) as LeadAction[]) {
    events.push({
      id: `leadact:${a.id}`,
      ts: a.updated_at,
      kind: 'lead_action',
      title: `Lead action · ${a.status.replaceAll('_', ' ')}`,
      detail: a.note ?? a.actor_email,
      source_table: 'lead_actions',
      source_id: String(a.id),
      payload: {
        status: a.status,
        actor_email: a.actor_email,
        hubspot_deal_id: a.hubspot_deal_id,
      },
    });
  }

  // Chronological — newest last keeps the UI's natural top-to-bottom
  // read; the route reverses for newest-first if it wants.
  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return events;
}
