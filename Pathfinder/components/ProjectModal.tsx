'use client';

// ProjectModal — centered overlay showing full project context.
// Mirrors `ProjectModal` in `pathfinder-prototype/project/hifi-shell.jsx`.
// Streams the rationale char-by-char on first open via Stream 4's <Typewriter />.

import * as React from 'react';
import type { Branch, OutreachDraft, Project } from '@/lib/types';
import { ScoreChip, StarIcon, VerifierBadge } from './ProjectList';
import { isFirstOpen, markSeen, Typewriter, useRailHeight } from './live';
import { useStarred, toggleStar } from '@/lib/user-prefs';
import { stageLabel, stagesEnumerated } from '@/lib/stages';
import { sourceLabel, sourcesEnumerated } from '@/lib/sources';
import { useScoringConfig } from '@/lib/scoring-config';
import { useOutreachDraftsForProject } from '@/lib/outreach-drafts-client';
import { formatPostedDate } from '@/lib/posted-date';
import { Tooltip } from './Tooltip';

// Width applied to every project-detail tooltip — Stage's full taxonomy
// list (5 values) is the longest and reads correctly at 165px without
// wrapping into >3 lines. Distance, Project Size, Posted all get the same width
// for visual consistency in the metrics row.
const METRIC_TOOLTIP_WIDTH = 165;

// Glossary copy for the metric-row labels. Built from the canonical
// stage / source taxonomies so the tooltip stays in sync as the data
// model evolves — change `lib/stages.ts` and the tooltip updates.
const METRIC_TOOLTIPS: Record<string, string> = {
  'Project Size': 'Estimated dollar value of the project as published on the source record.',
  Stage: `The project's current phase. Possible values: ${stagesEnumerated()}.`,
  Distance: "Distance from this project's location to the nearest Zedcor branch.",
  Posted: 'Date the source originally published this opportunity.',
};

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.14)',
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

const HI_THRESHOLD_FALLBACK = 80;

export interface ProjectModalProps {
  project: Project;
  branch: Branch | null;
  onClose: () => void;
}

export function ProjectModal({ project, branch, onClose }: ProjectModalProps) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const railH = useRailHeight();
  const { high_priority_threshold } = useScoringConfig();
  const hi = (project.score ?? 0) >= (high_priority_threshold || HI_THRESHOLD_FALLBACK);
  const starredSet = useStarred();
  const isStarred = starredSet.has(project.id);
  const { drafts: outreachDrafts, loading: draftsLoading } = useOutreachDraftsForProject(project.id);

  const rationale =
    project.rationale ??
    'Rationale pending. Once Pathfinder Ranker scores this project, the reasoning will appear here.';
  const hook = project.outreach_hook ?? 'Outreach hook will populate after the Ranker runs.';
  const dist = project.distance_miles != null ? `${project.distance_miles.toFixed(1)} mi` : '—';
  const value = formatValue(project.project_value);
  const stage = stageLabel(project.project_stage);
  const sourceDisplay = sourceLabel(project.source);
  const sourceUrl = sourceLinkFor(project);
  const firstOpen = isFirstOpen(project.id);

  const onCopyDraft = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${project.title}\n\n${rationale}\n\n${hook}`);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          // Full-viewport dim + blur. Previously stopped `railH` short of
          // the bottom so the activity rail stayed un-dimmed; that left
          // a visible band of dashboard chrome (BranchDock, Zoom control,
          // Agent Log pill) below the backdrop. Modal still sits between
          // top chrome and the rail (its maxHeight reserves rail space),
          // but the backdrop now covers everything.
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          background: 'rgba(10,10,10,0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, calc(-50% - ${railH / 2}px))`,
          width: 720,
          maxHeight: `calc(100vh - 80px - ${railH}px)`,
          background: PF.bg,
          border: `1px solid ${PF.ink}`,
          borderRadius: 8,
          boxShadow: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 51,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${PF.ruleSoft}` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreChip value={project.score} hi={hi} />
                {hi && <span className="pf-label" style={{ color: PF.hi }}>● High-priority</span>}
                <span className="pf-label">·</span>
                <span className="pf-label">
                  {branch?.id ?? project.nearest_branch_id ?? 'Unassigned'} · {dist}
                </span>
              </div>
              <div className="pf-h1" style={{ fontSize: 22, marginTop: 8, lineHeight: 1.2 }}>
                {project.title}
              </div>
              <div
                className="pf-mono"
                style={{
                  fontSize: 10.5,
                  color: PF.inkDim,
                  marginTop: 6,
                  letterSpacing: '0.04em',
                }}
              >
                {project.source_id} · {sourceDisplay} · posted {formatPostedDate(project.posted_date).top}
                {formatPostedDate(project.posted_date).subtitle
                  ? ` (${formatPostedDate(project.posted_date).subtitle})`
                  : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button
                type="button"
                onClick={onClose}
                title="Dismiss this opportunity for now"
                aria-label="Mark not relevant"
                style={{
                  background: PF.bgAlt,
                  border: '1px solid transparent',
                  borderRadius: 4,
                  height: 28,
                  padding: '0 10px',
                  cursor: 'pointer',
                  color: PF.inkDim,
                  font: `500 12px ${PF.sans}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Mark not relevant
              </button>
              <button
                type="button"
                onClick={() => toggleStar(project.id)}
                title={isStarred ? 'Unstar opportunity' : 'Star this opportunity to track it'}
                aria-label={isStarred ? 'Unstar' : 'Star'}
                style={{
                  background: isStarred ? 'rgba(255,180,84,0.16)' : PF.bgAlt,
                  border: isStarred ? '1px solid #FFB454' : '1px solid transparent',
                  borderRadius: 4,
                  height: 28,
                  padding: '0 10px',
                  cursor: 'pointer',
                  color: isStarred ? '#0a0a0a' : PF.inkDim,
                  font: `500 12px ${PF.sans}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <StarIcon filled={isStarred} size={13} />
                {isStarred ? 'Starred' : 'Star'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: PF.bgAlt,
                  border: 'none',
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  color: PF.inkDim,
                  font: `400 14px ${PF.sans}`,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderBottom: `1px solid ${PF.ruleSoft}`,
            background: PF.bgAlt,
          }}
        >
          {(() => {
            const posted = formatPostedDate(project.posted_date);
            return [
              { label: 'Project Size', value, subtitle: null as string | null, accent: null as string | null },
              { label: 'Stage', value: stage, subtitle: null, accent: null },
              { label: 'Distance', value: dist, subtitle: null, accent: null },
              { label: 'Posted', value: posted.top, subtitle: posted.subtitle, accent: null },
            ];
          })().map((cell, i) => (
            <div
              key={cell.label}
              style={{
                padding: '14px 20px',
                borderRight: i < 3 ? `1px solid ${PF.ruleSoft}` : 'none',
              }}
            >
              <Tooltip text={METRIC_TOOLTIPS[cell.label] ?? ''} placement="bottom" maxWidth={METRIC_TOOLTIP_WIDTH}>
                <span
                  className="pf-label"
                  style={{ fontSize: 9, cursor: 'help', borderBottom: '1px dotted rgba(10,10,10,0.22)' }}
                  tabIndex={0}
                >
                  {cell.label}
                </span>
              </Tooltip>
              <div
                className="pf-num"
                style={{ fontSize: 16, marginTop: 4, color: cell.accent || PF.ink }}
              >
                {cell.value}
              </div>
              {cell.subtitle && (
                <div
                  className="pf-mono"
                  style={{
                    fontSize: 10,
                    marginTop: 2,
                    color: PF.inkDim,
                    letterSpacing: '0.04em',
                  }}
                >
                  {cell.subtitle}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            overflowY: 'auto',
          }}
          className="pf-scrollbar"
        >
          <Section
            title="Rationale"
            sub={project.rationale_streamed_at ? 'cached' : 'ranker'}
            accent="hi"
          >
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>
              {firstOpen ? (
                <Typewriter
                  text={rationale}
                  charsPerSec={55}
                  onDone={() => markSeen(project.id)}
                />
              ) : (
                rationale
              )}
            </p>
          </Section>

          <Section title="Verifier" sub={verifierStatusSub(project.verified ?? null)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <VerifierBadge verified={project.verified ?? null} />
              {(project.verifier_pass_count ?? 0) > 0 && (
                <span
                  className="pf-mono"
                  style={{ fontSize: 10, color: PF.inkDim, letterSpacing: '0.04em' }}
                >
                  pass count · {project.verifier_pass_count}
                </span>
              )}
            </div>
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>
              {verifierBodyText(project.verified ?? null, project.verifier_notes ?? null)}
            </p>
          </Section>

          <Section title="Recommended outreach" sub="generated · approve before sending">
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>
              {hook}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="pf-btn" onClick={onCopyDraft}>
                Copy as draft
              </button>
              {/* "Mark not relevant" lives in the header next to Star.
                  Removed from this section so the outreach actions stay
                  focused on the positive copy/send action. */}
            </div>
          </Section>

          <Section title="Outreach drafts" sub={draftsSub(outreachDrafts, draftsLoading)}>
            <OutreachDraftsBlock drafts={outreachDrafts} loading={draftsLoading} />
          </Section>

          <Section title="Source record" sub={sourceDisplay}>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  font: `500 12px ${PF.mono}`,
                  color: PF.ink,
                  textDecoration: 'none',
                  padding: '6px 10px',
                  background: PF.bgAlt,
                  borderRadius: 3,
                }}
              >
                ↗ {sourceUrl.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>
                source link unavailable
              </span>
            )}
          </Section>

          <details style={{ paddingTop: 8, borderTop: `1px solid ${PF.ruleSoft}` }}>
            <summary
              style={{
                cursor: 'pointer',
                font: `500 11px ${PF.mono}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: PF.inkDim,
                listStyle: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ display: 'inline-block', width: 10 }}>▾</span>
              Raw payload (jsonb)
            </summary>
            <pre
              style={{
                margin: '10px 0 0',
                padding: 12,
                background: PF.bgAlt,
                borderRadius: 4,
                font: `400 10.5px/1.55 ${PF.mono}`,
                color: PF.inkSub,
                overflow: 'auto',
                maxHeight: 200,
              }}
              className="pf-scrollbar"
            >
              {JSON.stringify(project.raw_payload ?? {}, null, 2)}
            </pre>
          </details>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${PF.ruleSoft}`,
            background: PF.bgAlt,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span className="pf-label" style={{ fontSize: 9 }}>
            ESC to close
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="pf-btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  sub,
  accent,
  children,
}: {
  title: string;
  sub?: string;
  accent?: 'hi';
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {accent === 'hi' && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PF.hi }} />
          )}
          <span className="pf-label" style={{ color: PF.ink, fontSize: 10 }}>
            {title}
          </span>
        </span>
        {sub && <span className="pf-label" style={{ fontSize: 9 }}>{sub}</span>}
      </div>
      <div
        style={{
          padding: 14,
          background: accent === 'hi' ? PF.hiSoft : PF.bgAlt,
          borderRadius: 5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function formatValue(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ────────────────────────────────────────────────────────────────────
// Outreach drafts section — view-only renderer for the three channels
// (email + linkedin + voicemail) the Outreach Drafter agent produced.
// Iterating, regenerating, and sending drafts ships with the
// Intelligence Chat panel; this section is a pure read surface.
// ────────────────────────────────────────────────────────────────────

function draftsSub(drafts: OutreachDraft[], loading: boolean): string {
  if (loading) return 'loading…';
  if (drafts.length === 0) return 'pending · 15,45 cron';
  // Drafts are ordered by channel asc then draft_at desc; latest cycle's
  // three rows lead. Surface that timestamp in the sub-label so reviewers
  // see how fresh the copy is.
  const latest = drafts.reduce((max, d) => (d.draft_at > max ? d.draft_at : max), drafts[0].draft_at);
  return `latest · ${relativeTime(latest)}`;
}

function OutreachDraftsBlock({ drafts, loading }: { drafts: OutreachDraft[]; loading: boolean }) {
  if (loading) {
    return (
      <p className="pf-body" style={{ margin: 0, color: PF.inkDim }}>
        Loading drafts…
      </p>
    );
  }
  if (drafts.length === 0) {
    return (
      <p className="pf-body" style={{ margin: 0, color: PF.inkDim }}>
        No drafts yet. The Outreach agent runs at 15 and 45 past every hour
        and writes within ~30 minutes of verification.
      </p>
    );
  }
  // Group by channel and show the most recent draft per channel. The cron
  // writes one row per channel per cycle; subsequent iterations (chat
  // panel) will append additional rows. We always display the latest.
  const byChannel = pickLatestPerChannel(drafts);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {byChannel.email && <DraftCard draft={byChannel.email} />}
      {byChannel.linkedin && <DraftCard draft={byChannel.linkedin} />}
      {byChannel.voicemail && <DraftCard draft={byChannel.voicemail} />}
    </div>
  );
}

function pickLatestPerChannel(drafts: OutreachDraft[]): {
  email: OutreachDraft | null;
  linkedin: OutreachDraft | null;
  voicemail: OutreachDraft | null;
} {
  const out: { email: OutreachDraft | null; linkedin: OutreachDraft | null; voicemail: OutreachDraft | null } = {
    email: null,
    linkedin: null,
    voicemail: null,
  };
  for (const d of drafts) {
    const cur = out[d.channel];
    if (!cur || d.draft_at > cur.draft_at) out[d.channel] = d;
  }
  return out;
}

const CHANNEL_LABEL: Record<OutreachDraft['channel'], string> = {
  email: 'Email',
  linkedin: 'LinkedIn DM',
  voicemail: 'Voicemail (25 sec)',
};

function DraftCard({ draft }: { draft: OutreachDraft }) {
  return (
    <div
      style={{
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 4,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          className="pf-label"
          style={{ fontSize: 9, color: PF.ink }}
        >
          {CHANNEL_LABEL[draft.channel]}
        </span>
        <span
          className="pf-mono"
          style={{ fontSize: 9, color: PF.inkDim, letterSpacing: '0.04em' }}
        >
          {draft.word_count ?? 0} words · {relativeTime(draft.draft_at)}
        </span>
      </div>
      {draft.draft_subject && (
        <div
          className="pf-mono"
          style={{
            fontSize: 11,
            color: PF.ink,
            background: PF.bgAlt,
            padding: '6px 8px',
            borderRadius: 3,
            wordBreak: 'break-word',
          }}
        >
          Subject: {draft.draft_subject}
        </div>
      )}
      <p
        className="pf-body"
        style={{
          margin: 0,
          color: PF.ink,
          whiteSpace: 'pre-wrap',
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {draft.draft_body}
      </p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Sub-label shown next to the "Verifier" section title — short status hint. */
function verifierStatusSub(verified: boolean | null): string {
  if (verified === true) return 'passed · all 4 checks';
  if (verified === false) return 'flagged · awaiting re-rank';
  return 'awaiting verifier';
}

/**
 * Body text for the Verifier section. Falls back to documented defaults when
 * `verifier_notes` is empty or null, so the section is never blank.
 */
function verifierBodyText(verified: boolean | null, notes: string | null): string {
  const trimmed = (notes ?? '').trim();
  if (verified === null) {
    return 'Pending verification — Generator-Verifier loop will check rationale, branch attribution, score sensibility, and customer references.';
  }
  if (trimmed.length > 0) return trimmed;
  if (verified === true) {
    return 'Verifier passed all 4 checks (rationale · branch · score · customer-refs).';
  }
  return 'Verifier flagged at least one check. Awaiting re-rank.';
}

function sourceLinkFor(p: Project): string | null {
  // Best-effort: use raw_payload.url if present; otherwise return null.
  const url = p.raw_payload?.['url'] ?? p.raw_payload?.['source_url'] ?? p.raw_payload?.['link'];
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  return null;
}
