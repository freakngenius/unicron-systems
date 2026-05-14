// LibrarySkills — read-only Skills surface for the Atrium Library tab.
// Sprint 9 Stream C (Procedural Memory).
//
// Layout: filter row on top, two-column body below (list left, detail right).
// On narrow screens the detail panel collapses to full width and replaces
// the list when a Skill is selected.

import { useMemo, useState } from 'react';
import { useSkillsList } from './skillsApi';
import type { Skill, SkillLifecycleStatus } from './types';
import { SkillCard } from './SkillCard';
import { SkillDetailPanel } from './SkillDetailPanel';
import { SkillsListEmpty } from './SkillsListEmpty';

type ScopeFilter = 'any' | 'system' | 'tenant';

const LIFECYCLE_OPTIONS: { value: SkillLifecycleStatus; label: string }[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'retired',  label: 'Retired'  },
  { value: 'rejected', label: 'Rejected' },
];

const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: 'any',    label: 'All scopes' },
  { value: 'system', label: 'System' },
  { value: 'tenant', label: 'Tenant' },
];

export function LibrarySkills() {
  const [lifecycle, setLifecycle] = useState<SkillLifecycleStatus>('approved');
  const [scope, setScope] = useState<ScopeFilter>('any');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = useMemo(
    () => ({ lifecycle_status: lifecycle, scope }),
    [lifecycle, scope],
  );

  const { skills, loading, error } = useSkillsList(params);

  // Sort: latest activity (last_run_at) desc; nulls last.
  const sorted = useMemo(() => sortByActivity(skills), [skills]);

  const empty = !loading && !error && sorted.length === 0;

  return (
    <div data-testid="library-skills" className="w-full">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-wider text-text-secondary">
            Lifecycle
          </span>
          <select
            data-testid="library-skills-filter-lifecycle"
            value={lifecycle}
            onChange={(e) => setLifecycle(e.target.value as SkillLifecycleStatus)}
            className="mono text-[12px] bg-bg-card border border-border-default rounded-md px-2 py-1.5 text-text-primary focus:outline-none focus:border-[#6081BE]"
          >
            {LIFECYCLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-wider text-text-secondary">
            Scope
          </span>
          <select
            data-testid="library-skills-filter-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeFilter)}
            className="mono text-[12px] bg-bg-card border border-border-default rounded-md px-2 py-1.5 text-text-primary focus:outline-none focus:border-[#6081BE]"
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex-1" />

        <span
          data-testid="library-skills-count"
          className="mono text-[10px] uppercase tracking-wider text-text-secondary bg-bg-raised px-2 py-1 rounded"
        >
          {loading ? 'loading…' : `${sorted.length} skills`}
        </span>
      </div>

      {/* Two-column body */}
      <div
        className="library-skills-body grid gap-4"
        style={{
          gridTemplateColumns: selectedId ? 'minmax(0, 1fr) 380px' : 'minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <style>{`
          @media (max-width: 900px) {
            .library-skills-body { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {/* List */}
        <div className="flex flex-col gap-2 min-w-0">
          {loading && <SkillsListEmpty mode="loading" />}
          {!loading && error && (
            <SkillsListEmpty mode="error" hint={error} />
          )}
          {empty && (
            <SkillsListEmpty
              mode="empty"
              message="No Skills match the current filter."
              hint={
                lifecycle === 'approved'
                  ? 'Try Proposed or Retired to see lifecycle history.'
                  : 'Switch back to Approved to see live Skills.'
              }
            />
          )}
          {!loading &&
            !error &&
            sorted.map((s) => (
              <SkillCard
                key={s.id}
                skill={s}
                selected={selectedId === s.id}
                onSelect={(sk) => setSelectedId(sk.id)}
              />
            ))}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <SkillDetailPanel
            skillId={selectedId}
            onClose={() => setSelectedId(null)}
            onSelectVersion={(id) => setSelectedId(id)}
          />
        )}
      </div>
    </div>
  );
}

function sortByActivity(rows: Skill[]): Skill[] {
  return [...rows].sort((a, b) => {
    const at = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
    const bt = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
    if (at !== bt) return bt - at;
    // Stable secondary sort: name asc.
    return a.name.localeCompare(b.name);
  });
}
