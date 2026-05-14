// NowSkillsRecommendations — Sprint 9 Stream C.
//
// Surfaces the top procedural Skills relevant to the operator's current Now
// state. Derives a free-text query from:
//   - the most recent open action items for the signed-in DRI (top 3 titles)
//   - the most recent ledger entries from the day (top 5 summaries)
//   - the top customer names in the operator's pipeline view (top 3 names)
//
// Concatenates those snippets into one query string and hands it to the
// hybrid `/api/skills/search` endpoint via `useSkillsSearch`. The top 3
// results render as compact SkillCards with an invoke action.
//
// Invoke in Sprint 9 is a thin pass-through: it posts to the API and shows a
// toast. The deeper modal-driven input flow is owned by the existing
// SkillsSurface inside Now.tsx and is unchanged by this component.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { invokeSkill, useSkillsSearch } from './skillsApi';
import type { Skill } from './types';
import { SkillCard } from './SkillCard';
import { SkillsListEmpty } from './SkillsListEmpty';

interface NowContextSnapshot {
  actionItems: string[];
  ledgerSummaries: string[];
  customerNames: string[];
}

const EMPTY_SNAPSHOT: NowContextSnapshot = {
  actionItems: [],
  ledgerSummaries: [],
  customerNames: [],
};

/**
 * Pull the three context streams from Supabase via the same RPCs the rest
 * of Now uses. All three are tolerant to errors: a missing RPC just drops
 * that signal from the query.
 */
function useNowContext(teamMemberId: string | null): {
  snapshot: NowContextSnapshot;
  loading: boolean;
} {
  const [snapshot, setSnapshot] = useState<NowContextSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamMemberId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const sb = getSupabase();

    // Supabase calls return PromiseLike; wrap in Promise.resolve so we can
    // chain .catch() defensively. Each stream is independent; a failure in
    // one degrades the query rather than blocking the others.
    const actionItems: Promise<string[]> = Promise.resolve(
      sb.rpc('ns_top_of_mind_for_dri', { p_team_member_id: teamMemberId, p_limit: 3 }),
    )
      .then(({ data }) =>
        Array.isArray(data)
          ? (data as Array<{ title?: string; summary?: string }>)
              .map((row) => row.title ?? row.summary ?? '')
              .filter(Boolean)
          : [],
      )
      .catch(() => [] as string[]);

    const ledger: Promise<string[]> = Promise.resolve(
      sb.rpc('ns_list_skill_runs', { p_limit: 5 }),
    )
      .then(({ data }) =>
        Array.isArray(data)
          ? (data as Array<{ content_summary?: string }>)
              .map((row) => row.content_summary ?? '')
              .filter(Boolean)
          : [],
      )
      .catch(() => [] as string[]);

    const customers: Promise<string[]> = Promise.resolve(
      sb.rpc('ns_list_customers', { p_limit: 3 }),
    )
      .then(({ data }) =>
        Array.isArray(data)
          ? (data as Array<{ name?: string }>).map((row) => row.name ?? '').filter(Boolean)
          : [],
      )
      .catch(() => [] as string[]);

    Promise.all([actionItems, ledger, customers])
      .then(([ai, le, cu]) => {
        if (cancelled) return;
        setSnapshot({ actionItems: ai, ledgerSummaries: le, customerNames: cu });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamMemberId]);

  return { snapshot, loading };
}

function buildQuery(snap: NowContextSnapshot): string {
  // Keep the query short so the FTS branch returns useful hits. The vector
  // branch operates on the full concatenation; FTS truncation is fine since
  // RRF unions both ranked lists.
  const parts: string[] = [
    ...snap.actionItems.slice(0, 3),
    ...snap.ledgerSummaries.slice(0, 3),
    ...snap.customerNames.slice(0, 3),
  ];
  return parts.join(' · ').slice(0, 600);
}

interface Props {
  teamMemberId: string | null;
  /**
   * Toast emitter from the parent Now.tsx — keeps invoke feedback in the
   * existing notification rail rather than building a new one.
   */
  onToast?: (text: string) => void;
}

export function NowSkillsRecommendations({ teamMemberId, onToast }: Props) {
  const { snapshot, loading: ctxLoading } = useNowContext(teamMemberId);
  const query = useMemo(() => buildQuery(snapshot), [snapshot]);
  const { results, loading: searchLoading, error } = useSkillsSearch(query, {
    topK: 3,
    enabled: query.length > 0,
  });

  const loading = ctxLoading || searchLoading;
  const top3 = results.slice(0, 3);

  return (
    <section
      data-testid="now-skills-recommendations"
      aria-label="Recommended skills"
      className="bg-bg-card border border-border-default rounded-xl overflow-hidden"
    >
      <header className="px-4 py-3 border-b border-border-subtle flex items-baseline justify-between">
        <div>
          <h2 className="mono text-[13px] font-semibold text-text-primary">
            Recommended skills
          </h2>
          <p className="mono text-[10.5px] text-text-secondary mt-0.5">
            Pulled from your action items, today's ledger, and active customers.
          </p>
        </div>
        <span className="mono text-[10px] uppercase tracking-wider text-text-secondary bg-bg-raised px-2 py-0.5 rounded">
          {loading ? '…' : `${top3.length} / 3`}
        </span>
      </header>

      <div className="px-4 py-3 flex flex-col gap-2">
        {loading && <SkillsListEmpty mode="loading" />}
        {!loading && error && (
          <SkillsListEmpty
            mode="error"
            message="Could not search Skills."
            hint={error}
          />
        )}
        {!loading && !error && top3.length === 0 && (
          <SkillsListEmpty
            mode="empty"
            message="No Skill matched the current Now state."
            hint="Capture an action item or log a customer touch to surface ideas."
          />
        )}
        {!loading &&
          !error &&
          top3.map(({ skill }) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              compact
              action={<InvokeButton skill={skill} onToast={onToast} />}
            />
          ))}
      </div>
    </section>
  );
}

function InvokeButton({
  skill,
  onToast,
}: {
  skill: Skill;
  onToast?: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const disabled = busy || skill.lifecycle_status !== 'approved';

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (disabled) return;
    setBusy(true);
    try {
      const { ok, status } = await invokeSkill(skill.id);
      if (ok) {
        onToast?.(`Queued ${skill.name}`);
      } else {
        onToast?.(`Invoke failed (${status})`);
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Invoke failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-testid={`now-skills-invoke-${skill.id}`}
      aria-label={`Invoke ${skill.name}`}
      className="mono text-[10.5px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded text-white disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: '#6081BE' }}
    >
      {busy ? '…' : 'Run'}
    </button>
  );
}
