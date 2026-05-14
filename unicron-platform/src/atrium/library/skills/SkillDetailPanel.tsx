// SkillDetailPanel — read-only detail view for a single procedural Skill.
//
// Shows full description, inputs/outputs schema (collapsible JSON), the
// refusal-gate flag, budget per run, the SKILL.md path, and the version
// history. Clicking an older version opens it as a sibling detail (handled
// by the parent via `onSelectVersion`).
//
// Sprint 9 is read-only: no edit/approve/reject controls.

import { useState } from 'react';
import { useSkill } from './skillsApi';
import type { Skill, SkillWithHistory } from './types';
import { authorKindLabel } from './types';
import { SkillsListEmpty } from './SkillsListEmpty';

interface Props {
  skillId: string;
  onClose: () => void;
  onSelectVersion?: (skillId: string) => void;
}

function CollapsibleJson({
  title,
  value,
  defaultOpen = false,
}: {
  title: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const empty = value === null || value === undefined;
  const json = empty ? '—' : safeJson(value);
  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 bg-bg-raised hover:bg-bg-card transition-colors"
      >
        <span className="mono text-[11px] uppercase tracking-wider text-text-secondary">
          {title}
        </span>
        <span className="mono text-[10px] text-text-secondary">
          {open ? 'hide' : 'show'}
        </span>
      </button>
      {open && (
        <pre className="mono text-[11px] text-text-primary bg-bg-base px-3 py-2.5 overflow-x-auto whitespace-pre-wrap break-words m-0">
          {json}
        </pre>
      )}
    </div>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="mono text-[10px] uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <span className="mono text-[11.5px] text-text-primary text-right break-all">
        {value}
      </span>
    </div>
  );
}

function VersionHistory({
  skill,
  onSelectVersion,
}: {
  skill: SkillWithHistory;
  onSelectVersion?: (id: string) => void;
}) {
  const entries: Skill[] = [skill, ...skill.history];
  // Latest first.
  entries.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-bg-raised">
        <span className="mono text-[11px] uppercase tracking-wider text-text-secondary">
          Version history
        </span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {entries.map((entry) => {
          const isCurrent = entry.id === skill.id;
          return (
            <li
              key={entry.id}
              data-testid={`skill-version-${entry.id}`}
              className="px-3 py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="mono text-[12px] text-text-primary">
                  v{entry.version}{' '}
                  <span className="text-text-secondary">
                    · {authorKindLabel(entry.author_kind)}
                  </span>
                </div>
                <div className="mono text-[10.5px] text-text-secondary truncate">
                  {entry.lifecycle_status}
                  {entry.created_at ? ` · ${formatDate(entry.created_at)}` : ''}
                </div>
              </div>
              {isCurrent ? (
                <span className="mono text-[10px] uppercase tracking-wider text-[#6081BE]">
                  current
                </span>
              ) : onSelectVersion ? (
                <button
                  type="button"
                  onClick={() => onSelectVersion(entry.id)}
                  className="mono text-[10.5px] text-text-secondary hover:text-text-primary underline-offset-2 hover:underline"
                >
                  open
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function SkillDetailPanel({ skillId, onClose, onSelectVersion }: Props) {
  const { skill, loading, error } = useSkill(skillId);

  return (
    <aside
      data-testid="skill-detail-panel"
      aria-label="Skill detail"
      className="bg-bg-card border border-border-default rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <span className="mono text-[11px] uppercase tracking-wider text-text-secondary">
          Skill detail
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          className="mono text-[10.5px] text-text-secondary hover:text-text-primary"
        >
          close
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading && <SkillsListEmpty mode="loading" />}
        {!loading && error && (
          <SkillsListEmpty
            mode="error"
            message="Could not load this Skill."
            hint={error}
          />
        )}
        {!loading && !error && skill && (
          <>
            <div>
              <h2 className="mono text-[15px] font-semibold text-text-primary leading-tight">
                {skill.name}
              </h2>
              {skill.description && (
                <p className="mono text-[12px] text-text-secondary leading-snug mt-1.5">
                  {skill.description}
                </p>
              )}
            </div>

            <div>
              <MetaRow label="Lifecycle" value={skill.lifecycle_status} />
              <MetaRow label="Version" value={`v${skill.version}`} />
              <MetaRow label="Author" value={authorKindLabel(skill.author_kind)} />
              <MetaRow label="Domain" value={skill.domain ?? '—'} />
              <MetaRow
                label="Refusal gate"
                value={skill.refusal_gate ? 'enabled' : 'off'}
              />
              <MetaRow
                label="Budget / run"
                value={
                  skill.budget_usd_per_run !== null
                    ? `$${Number(skill.budget_usd_per_run).toFixed(2)}`
                    : '—'
                }
              />
              <MetaRow
                label="Scope"
                value={skill.customer_id ? 'tenant' : 'system'}
              />
              <MetaRow
                label="Runs"
                value={`${skill.run_count} · ${skill.success_count} ok`}
              />
              <MetaRow
                label="Decay at"
                value={skill.decay_at ? formatDate(skill.decay_at) : '—'}
              />
              <MetaRow
                label="SKILL.md"
                value={
                  skill.skill_md_path ? (
                    <a
                      href={skillMdUrl(skill.skill_md_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-[#6081BE]"
                    >
                      {skill.skill_md_path}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
            </div>

            <CollapsibleJson title="Inputs schema" value={skill.inputs_schema} />
            <CollapsibleJson title="Outputs schema" value={skill.outputs_schema} />
            {skill.evidence && skill.evidence.length > 0 && (
              <CollapsibleJson title="Evidence" value={skill.evidence} />
            )}

            <VersionHistory skill={skill} onSelectVersion={onSelectVersion} />
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * Resolve a vault `skill_md_path` (e.g. "wiki/skills/run-zedcor-weekly-digest.md")
 * to a clickable GitHub URL on freakngenius/unicron-knowledge. Falls back to
 * the raw path if it already looks like an absolute URL.
 */
function skillMdUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const cleaned = path.replace(/^\/+/, '');
  return `https://github.com/freakngenius/unicron-knowledge/blob/main/${cleaned}`;
}
