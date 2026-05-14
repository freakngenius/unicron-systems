// SkillCard — list-row representation of a procedural-memory Skill.
// Used by LibrarySkills.tsx (Library tab) and NowSkillsRecommendations
// (Now tab). Read-only: no invoke buttons here.

import type { Skill } from './types';
import { authorKindGlyph, authorKindLabel } from './types';

// Relative-time helper matching the Library.tsx `timeAgo` shape so all
// surfaces in Library read the same. Forward-dated stamps (decay_at, etc.)
// render as "in 5d" rather than "-5d ago".
function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - Date.now();
  const future = diff > 0;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return future ? `in ${months}mo` : `${months}mo ago`;
}

function truncate(text: string | null, n: number): string {
  if (!text) return '';
  if (text.length <= n) return text;
  return `${text.slice(0, n - 1).trimEnd()}…`;
}

const LIFECYCLE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  approved:  { bg: 'rgba(31,138,91,0.10)',  fg: '#1F8A5B', label: 'approved' },
  proposed:  { bg: 'rgba(201,162,39,0.12)', fg: '#8B6F0A', label: 'proposed' },
  retired:   { bg: 'rgba(124,135,160,0.14)',fg: '#5A6577', label: 'retired'  },
  rejected:  { bg: 'rgba(225,75,75,0.10)',  fg: '#B23636', label: 'rejected' },
};

interface Props {
  skill: Skill;
  selected?: boolean;
  onSelect?: (skill: Skill) => void;
  /** When true, render a tighter card suitable for the Now tab rail. */
  compact?: boolean;
  /** Optional right-rail action node (e.g. an Invoke button in the Now tab). */
  action?: React.ReactNode;
}

export function SkillCard({ skill, selected, onSelect, compact, action }: Props) {
  const lc = LIFECYCLE_STYLES[skill.lifecycle_status] ?? LIFECYCLE_STYLES.approved;
  const total = skill.run_count ?? 0;
  const successes = skill.success_count ?? 0;
  const successRate = total > 0 ? Math.round((successes / total) * 100) : null;

  const interactive = typeof onSelect === 'function';
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      data-testid={`skill-card-${skill.id}`}
      onClick={interactive ? () => onSelect!(skill) : undefined}
      aria-pressed={interactive ? !!selected : undefined}
      className={[
        'group block w-full text-left rounded-xl border transition-colors',
        compact ? 'p-2.5' : 'p-3.5',
        selected
          ? 'border-[#6081BE] bg-[rgba(96,129,190,0.06)]'
          : 'border-border-default bg-bg-card hover:border-border-hover',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        {/* Author glyph */}
        <span
          aria-label={`Authored by ${authorKindLabel(skill.author_kind)}`}
          title={authorKindLabel(skill.author_kind)}
          className="mono inline-flex w-5 h-5 rounded-md flex-shrink-0 items-center justify-center text-[10px] font-semibold text-text-secondary bg-bg-raised border border-border-subtle"
        >
          {authorKindGlyph(skill.author_kind)}
        </span>

        <div className="flex-1 min-w-0">
          {/* Name + version */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mono text-[13px] font-semibold text-text-primary truncate">
              {skill.name}
            </span>
            <span className="mono text-[10px] uppercase tracking-wider text-text-secondary bg-bg-raised px-1.5 py-0.5 rounded">
              v{skill.version}
            </span>
            {skill.refusal_gate && (
              <span className="mono text-[9px] uppercase tracking-wider text-[#E14B4B] bg-[rgba(225,75,75,0.10)] px-1.5 py-0.5 rounded">
                gated
              </span>
            )}
            {skill.customer_id && (
              <span className="mono text-[9px] uppercase tracking-wider text-[#6081BE] bg-[rgba(96,129,190,0.10)] px-1.5 py-0.5 rounded">
                tenant
              </span>
            )}
          </div>

          {/* Description */}
          {skill.description && (
            <div
              className={`mono text-text-secondary leading-snug mt-1 ${
                compact ? 'text-[11px] line-clamp-2' : 'text-[11.5px]'
              }`}
            >
              {compact ? truncate(skill.description, 120) : truncate(skill.description, 220)}
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap mt-2 mono text-[10.5px] text-text-secondary">
            {skill.domain && (
              <span className="bg-bg-raised px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px]">
                {skill.domain}
              </span>
            )}
            <span
              aria-label={`Lifecycle: ${lc.label}`}
              className="mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: lc.bg, color: lc.fg }}
            >
              {lc.label}
            </span>
            <span aria-label={`${total} total runs, ${successes} succeeded`}>
              {total} runs
              {successRate !== null ? ` · ${successRate}%` : ''}
            </span>
            <span aria-label={`Decays ${relTime(skill.decay_at)}`}>
              decays {relTime(skill.decay_at)}
            </span>
          </div>
        </div>

        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </div>
    </Tag>
  );
}
