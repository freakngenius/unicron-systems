// Work.tsx — Sprint 4 Stream D
// Atrium Work tab root. 5 sub-views: Action Items, Calls Log, Decisions
// Timeline, Kanban Embeds, Sprints.
// GAP W-1 (2026-05-10): Refusal Log is intentionally omitted here.
// System > Refusal Log is the canonical location per routing decision W-1.

import { useState } from 'react';
import { ActionItems } from './work/ActionItems';
import { CallsLog } from './work/CallsLog';
import { DecisionsTimeline } from './work/DecisionsTimeline';
import { KanbanEmbeds } from './work/KanbanEmbeds';
import { SprintsView } from './work/SprintsView';

// ─── Constants ────────────────────────────────────────────────────────────────

const WORK_TABS = [
  'action-items',
  'calls',
  'decisions',
  'kanban',
  'sprints',
] as const;
type WorkTab = (typeof WORK_TABS)[number];

const WORK_TAB_LABELS: Record<WorkTab, string> = {
  'action-items': 'Action Items',
  calls: 'Calls Log',
  decisions: 'Decisions',
  kanban: 'Kanban',
  sprints: 'Sprints',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Work() {
  const [active, setActive] = useState<WorkTab>('action-items');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-text-primary font-semibold">Work</h1>
        <p className="mono text-[11px] text-text-secondary mt-1">
          Action items, call logs, decisions, kanban, and sprint tracking. Refusal
          history is in System &rsaquo; Refusal Log.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav
        className="flex gap-0.5 border-b border-border-default mb-6 overflow-x-auto"
        aria-label="Work sub-tabs"
        role="tablist"
      >
        {WORK_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`work-panel-${tab}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? 'var(--text-hi)' : 'var(--text-lo)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              {WORK_TAB_LABELS[tab]}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <section id={`work-panel-${active}`} role="tabpanel" aria-label={WORK_TAB_LABELS[active]}>
        {active === 'action-items' && <ActionItems />}
        {active === 'calls' && <CallsLog />}
        {active === 'decisions' && <DecisionsTimeline />}
        {active === 'kanban' && <KanbanEmbeds />}
        {active === 'sprints' && <SprintsView />}
      </section>
    </div>
  );
}
