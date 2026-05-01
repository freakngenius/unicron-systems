// services/architect/tools/feedback-store.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4 (queryFeedback tool data sources).
//
// Pathfinder feedback surfaces, normalized into a single Feedback shape
// the tuning session can reason about:
//
//   - lead_actions          accept / dismiss / snooze with optional reason
//   - outreach_edits        rep edits to model-drafted outreach
//   - slack_messages        slack accept/dismiss/snooze actions
//
// outreach_edits is owned by Stream B Gate B2 — read-only contract. Until
// B2 merges + applies migration 0051, the table doesn't exist live. The
// reader treats "table missing" as zero feedback rather than failing.

export type FeedbackKind =
  | 'lead_action.accept'
  | 'lead_action.dismiss'
  | 'lead_action.snooze'
  | 'slack.accept'
  | 'slack.dismiss'
  | 'slack.snooze'
  | 'outreach.heavy_edit'
  | 'outreach.light_edit'
  | 'outreach.no_edit';

export interface Feedback {
  kind: FeedbackKind;
  // Polarity: 'positive' = accept-class signal; 'negative' = dismiss-class
  // signal; 'neutral' = ambiguous (snooze, light edit).
  polarity: 'positive' | 'negative' | 'neutral';
  project_id: string | null;
  reason: string | null;             // free-form
  ts: string;                        // ISO timestamp
  // Pipeline trace: which agents produced the artifact this feedback is on.
  // Drives `analyzeRejectionPatterns` clustering and `loadAgent` lookup.
  pipeline_trace: string[];
  // Source-row reference for debugging / proposal context.
  source_table: 'lead_actions' | 'outreach_edits' | 'slack_messages';
  source_id: string | number;
}

export interface FeedbackStore {
  loadFeedback(verticalId: string, sinceIso: string): Promise<Feedback[]>;
  // For loadAgent — returns the instruction string for a role in a vertical.
  // For Pathfinder Phase 2 reality there is no per-vertical agent table;
  // we read from on-disk prompt constants. Stubbed; can be promoted to
  // a DB read when an agents table exists.
  loadAgentInstruction(role: string, verticalId: string): Promise<string | null>;
}

class SupabaseFeedbackStore implements FeedbackStore {
  async loadFeedback(verticalId: string, sinceIso: string): Promise<Feedback[]> {
    void verticalId; // single-vertical for now; reserve param for Phase 2.5
    const { supabaseAdmin } = await import('@/lib/supabase');
    type AnyClient = {
      from: (t: string) => {
        select: (cols: string) => {
          gte: (col: string, v: string) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
    const sb = supabaseAdmin() as unknown as AnyClient;
    const out: Feedback[] = [];

    // ---- lead_actions -----------------------------------------------------
    try {
      const { data, error } = await sb
        .from('lead_actions')
        .select(
          'id, project_id, action_type, action_reason, created_at, agents_used',
        )
        .gte('created_at', sinceIso);
      if (!error && data) {
        for (const row of data) {
          const action = String(row.action_type ?? '');
          const polarity =
            action === 'accept'
              ? 'positive'
              : action === 'dismiss'
              ? 'negative'
              : 'neutral';
          const agents = Array.isArray(row.agents_used) ? row.agents_used.map(String) : [];
          out.push({
            kind: (action === 'accept'
              ? 'lead_action.accept'
              : action === 'dismiss'
              ? 'lead_action.dismiss'
              : 'lead_action.snooze') as FeedbackKind,
            polarity,
            project_id: (row.project_id as string | null) ?? null,
            reason: (row.action_reason as string | null) ?? null,
            ts: String(row.created_at),
            pipeline_trace: agents,
            source_table: 'lead_actions',
            source_id: row.id as number,
          });
        }
      }
    } catch (err) {
      console.warn('[architect.feedback] lead_actions read failed:', err);
    }

    // ---- outreach_edits — Stream B Gate B2 contract -----------------------
    // Treat missing table as empty feedback (B2 may not have shipped yet).
    try {
      const { data, error } = await sb
        .from('outreach_edits')
        .select('id, project_id, draft_body, sent_body, edit_distance, edit_summary, created_at')
        .gte('created_at', sinceIso);
      if (!error && data) {
        for (const row of data) {
          const dist = Number(row.edit_distance ?? 0);
          // Heuristic: heavy edit = distance > 200 chars; light = 50..200; none < 50.
          const kind: FeedbackKind =
            dist > 200 ? 'outreach.heavy_edit' : dist > 50 ? 'outreach.light_edit' : 'outreach.no_edit';
          const polarity = dist > 200 ? 'negative' : dist > 50 ? 'neutral' : 'positive';
          const editSummary = (row.edit_summary as Record<string, unknown> | null) ?? null;
          const reason = editSummary
            ? JSON.stringify(editSummary).slice(0, 240)
            : `edit_distance=${dist}`;
          out.push({
            kind,
            polarity,
            project_id: (row.project_id as string | null) ?? null,
            reason,
            ts: String(row.created_at),
            pipeline_trace: ['outreach-drafter'],
            source_table: 'outreach_edits',
            source_id: row.id as string,
          });
        }
      }
    } catch (err) {
      // Expected when B2 migration hasn't applied yet.
      console.info('[architect.feedback] outreach_edits unavailable (Stream B B2 may not have shipped yet):', err);
    }

    // ---- slack_messages — accept/dismiss buttons --------------------------
    try {
      const { data, error } = await sb
        .from('slack_messages')
        .select('id, project_id, resolved_action, resolved_by_email, resolved_at, posted_at')
        .gte('posted_at', sinceIso);
      if (!error && data) {
        for (const row of data) {
          if (!row.resolved_action) continue;
          const action = String(row.resolved_action);
          const polarity =
            action === 'accept'
              ? 'positive'
              : action === 'dismiss'
              ? 'negative'
              : 'neutral';
          out.push({
            kind: (action === 'accept'
              ? 'slack.accept'
              : action === 'dismiss'
              ? 'slack.dismiss'
              : 'slack.snooze') as FeedbackKind,
            polarity,
            project_id: (row.project_id as string | null) ?? null,
            reason: null,
            ts: String(row.resolved_at ?? row.posted_at),
            pipeline_trace: ['ranker', 'verifier', 'outreach-drafter'],
            source_table: 'slack_messages',
            source_id: row.id as number,
          });
        }
      }
    } catch (err) {
      console.warn('[architect.feedback] slack_messages read failed:', err);
    }

    out.sort((a, b) => a.ts.localeCompare(b.ts));
    return out;
  }

  async loadAgentInstruction(role: string, verticalId: string): Promise<string | null> {
    void verticalId;
    // Pathfinder doesn't currently have a per-agent instruction table —
    // production prompts live as TS constants. Map the role to its module.
    // Returning null is a valid signal: the tuning session learns "no
    // editable instruction for this role yet" and can still surface a
    // proposal that's marked as "documentation-only" for the operator.
    const knownInstructions: Record<string, string> = {
      qualifier:
        'Score the project for relevance to the buyer pain. Return {qualified: bool, confidence: 0..1, reason: string}. Implementation: lib/scoring.ts (folded into Ranker per D6).',
      'outreach-drafter':
        'Draft 3-channel outreach (email subject + body, Slack one-liner, HubSpot note) for verified high-priority projects. Implementation: lib/outreach.ts + prompts/outreach.md.',
      ranker:
        'Score signals 0-100 for prioritization, combining qualification confidence, project value, and proximity. Implementation: lib/scoring.ts + lib/claude.ts (rationale).',
      verifier:
        'Run independent web research to verify high-priority signals; demote stale or contradicted signals. Implementation: app/api/cron/verifier/route.ts + agent-specs/02-verifier.md.',
      'geo-mapper':
        'Map the signal to its geographic context: lat/lon, county, state, nearest customer branch. Implementation: lib/scoring.ts:nearestBranch.',
      enricher:
        'Add structured context to the qualified signal: identify entity, location, transaction value, key actors. Implementation: folded into the ingestor + ranker rationale today.',
      briefer:
        'Aggregate the week\'s verified decisions into a one-page briefing for the customer. Implementation: lib/briefing.ts.',
    };
    return knownInstructions[role.toLowerCase()] ?? null;
  }
}

let _store: FeedbackStore | null = null;
export function getFeedbackStore(): FeedbackStore {
  if (_store) return _store;
  _store = new SupabaseFeedbackStore();
  return _store;
}

export function setFeedbackStoreForTesting(store: FeedbackStore | null): void {
  _store = store;
}
