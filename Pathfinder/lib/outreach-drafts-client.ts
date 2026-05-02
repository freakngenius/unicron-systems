'use client';

// lib/outreach-drafts-client.ts — browser-only hooks for reading the
// `pathfinder.outreach_drafts` table via /api/outreach-drafts.
//
// Two hooks:
//
//   - useOutreachDraftCounts() — fleet-wide map of projectId → draft count.
//     Used by ProjectList to render the "N drafts" badge on each row.
//     Refetches when an `outreach`-tagged event lands in the agent_log
//     realtime stream so the badge updates within seconds of the cron
//     writing new rows.
//
//   - useOutreachDraftsForProject(projectId) — full draft rows for one
//     project. Used by ProjectModal's "Outreach drafts" section. Drafts
//     are immutable once written, so this fetches once when projectId
//     changes and never refetches.
//
// Spec: Pathfinder/docs/PLAN-p0-02b-outreach-visible-progress.md § 4.2.

import * as React from 'react';
import type { OutreachDraft } from '@/lib/types';
import { useAgentLog } from '@/lib/realtime';

// ────────────────────────────────────────────────────────────────────
// useOutreachDraftCounts
// ────────────────────────────────────────────────────────────────────

interface CountsState {
  counts: Record<string, number>;
  loading: boolean;
}

const EMPTY_COUNTS: CountsState = { counts: {}, loading: true };

export function useOutreachDraftCounts(): CountsState {
  const [state, setState] = React.useState<CountsState>(EMPTY_COUNTS);
  const log = useAgentLog();

  // Refetch when a fresh outreach event lands. We watch the latest
  // `draft_pass` / `draft_warn` event timestamp; any change triggers a
  // refetch. The agent_log subscription is already shared across the
  // dashboard, so this hook adds no extra realtime cost.
  const latestOutreachTs = React.useMemo(() => {
    for (const row of log) {
      if (row.agent_name === 'outreach' && (row.event_type === 'draft_pass' || row.event_type === 'draft_warn')) {
        return row.ts;
      }
    }
    return null;
  }, [log]);

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetch('/pathfinder/api/outreach-drafts')
      .then((r) => (r.ok ? r.json() : { counts: {} }))
      .then((data: { counts?: Record<string, number> }) => {
        if (cancelled) return;
        setState({ counts: data.counts ?? {}, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ counts: {}, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [latestOutreachTs]);

  return state;
}

// ────────────────────────────────────────────────────────────────────
// useOutreachDraftsForProject
// ────────────────────────────────────────────────────────────────────

interface DraftsState {
  drafts: OutreachDraft[];
  loading: boolean;
}

const EMPTY_DRAFTS: DraftsState = { drafts: [], loading: false };

export function useOutreachDraftsForProject(projectId: string | null): DraftsState {
  const [state, setState] = React.useState<DraftsState>(EMPTY_DRAFTS);

  React.useEffect(() => {
    if (!projectId) {
      setState(EMPTY_DRAFTS);
      return;
    }
    let cancelled = false;
    setState({ drafts: [], loading: true });
    fetch(`/pathfinder/api/outreach-drafts?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((data: { drafts?: OutreachDraft[] }) => {
        if (cancelled) return;
        setState({ drafts: data.drafts ?? [], loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ drafts: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return state;
}
