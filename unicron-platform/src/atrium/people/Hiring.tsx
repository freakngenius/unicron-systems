// Hiring.tsx — Sprint 5 Stream E
// Hiring pipeline from nervous_system.hiring_candidates.
// Hidden (returns null) when data is empty.
// Placeholder card shown when the table doesn't exist.

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  name: string;
  stage: string;
  role: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  'Sourced',
  'Screening',
  'Interview',
  'Offer',
  'Accepted',
  'Declined',
] as const;

type PipelineStage = (typeof PIPELINE_STAGES)[number];

const STAGE_COLORS: Record<PipelineStage, string> = {
  Sourced:    'rgba(107,114,128,0.8)',
  Screening:  'rgba(111,149,214,0.8)',
  Interview:  'rgba(217,162,58,0.8)',
  Offer:      'rgba(232,118,58,0.8)',
  Accepted:   '#2E8E66',
  Declined:   '#E14B4B',
};

// ─── Pill badge ───────────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage as PipelineStage] ?? 'rgba(107,114,128,0.8)';
  const isDeclined = stage === 'Declined';
  const isAccepted = stage === 'Accepted';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: isAccepted ? 'var(--ok-soft)' : isDeclined ? 'var(--err-soft)' : 'var(--bg-raised)',
      color: isAccepted ? 'var(--ok)' : isDeclined ? 'var(--err)' : color,
      border: `1px solid ${isAccepted ? 'rgba(79,178,134,0.25)' : isDeclined ? 'rgba(221,98,98,0.25)' : 'var(--border-subtle)'}`,
      padding: '2px 8px', borderRadius: 'var(--r-pill)',
      fontSize: 'var(--text-xs)', fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {stage}
    </span>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const age = (() => {
    const d = Math.floor((Date.now() - new Date(candidate.created_at).getTime()) / 86400000);
    return d === 0 ? 'today' : `${d}d ago`;
  })();

  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-md)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)', fontWeight: 500 }}>
          {candidate.name}
        </span>
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {age}
        </span>
      </div>
      {candidate.role && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)' }}>
          {candidate.role}
        </div>
      )}
      {candidate.source && (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)' }}>
          via {candidate.source}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HiringProps {
  /** If true, always render (used in top-level People tab to show placeholder). */
  forceShow?: boolean;
}

export function Hiring({ forceShow = false }: HiringProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();

    async function load() {
      try {
        // PGRST106 fix: use ns_list_hiring_candidates RPC (gracefully handles absent table)
        const { data, error } = await sb.rpc('ns_list_hiring_candidates');

        if (cancelled) return;

        if (error) {
          // RPC itself failed — treat as table-absent
          setTableExists(false);
          setLoading(false);
          return;
        }

        const rows = (data as Candidate[] | null) ?? [];
        // If RPC returns empty array it means table exists but no rows (or table missing)
        // The RPC handles absent table gracefully by returning empty result set
        setCandidates(rows);
      } catch {
        if (!cancelled) setTableExists(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ height: 80, background: 'var(--bg-elevated)', borderRadius: 'var(--r-lg)', animation: 'pulse 1.5s ease-in-out infinite' }}>
        <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
      </div>
    );
  }

  // Table doesn't exist → show placeholder (always)
  if (!tableExists) {
    return (
      <div style={{
        padding: '24px 28px', background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>
          No active hiring pipeline.
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', marginTop: 6 }}>
          Create candidates in Supabase{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>nervous_system.hiring_candidates</span>{' '}
          to activate this view.
        </div>
      </div>
    );
  }

  // Data exists but table is empty — hide component unless forceShow
  if (candidates.length === 0 && !forceShow) {
    return null;
  }

  if (candidates.length === 0) {
    return (
      <div style={{
        padding: '24px 28px', background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>
          No active hiring pipeline. Create candidates in Supabase to activate.
        </div>
      </div>
    );
  }

  // Group candidates by stage
  const byStage: Record<string, Candidate[]> = {};
  for (const stage of PIPELINE_STAGES) byStage[stage] = [];
  for (const c of candidates) {
    const bucket = PIPELINE_STAGES.includes(c.stage as PipelineStage) ? c.stage : 'Sourced';
    byStage[bucket].push(c);
  }

  const activeStages = PIPELINE_STAGES.filter((s) => byStage[s].length > 0);

  return (
    <div>
      {/* Stage summary row */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        {activeStages.map((stage) => (
          <div key={stage} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-pill)',
            fontSize: 'var(--text-xs)', color: 'var(--text-md)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: STAGE_COLORS[stage],
              display: 'inline-block', flexShrink: 0,
            }} />
            {stage}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-lo)', fontSize: 'var(--text-2xs)' }}>
              {byStage[stage].length}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-lo)', display: 'flex', alignItems: 'center' }}>
          {candidates.length} total
        </div>
      </div>

      {/* Kanban-style columns */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {PIPELINE_STAGES.map((stage) => {
          const cols = byStage[stage];
          return (
            <div
              key={stage}
              style={{
                flex: '1 0 180px', minWidth: 180, maxWidth: 240,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-faint)',
                borderRadius: 'var(--r-md)',
                borderTop: `3px solid ${STAGE_COLORS[stage]}`,
                padding: 10, minHeight: 100,
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 10,
              }}>
                <span style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-md)',
                  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
                }}>
                  {stage}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', fontFamily: 'var(--font-mono)' }}>
                  {cols.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {cols.map((c) => (
                  <CandidateCard key={c.id} candidate={c} />
                ))}
                {cols.length === 0 && (
                  <div style={{
                    fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
                    padding: '12px 8px', textAlign: 'center', fontStyle: 'italic',
                  }}>
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stage pill display at bottom for reference */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {candidates
          .filter((c) => c.stage === 'Accepted' || c.stage === 'Declined')
          .map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)' }}>{c.name}</span>
              <StagePill stage={c.stage} />
            </div>
          ))}
      </div>
    </div>
  );
}
