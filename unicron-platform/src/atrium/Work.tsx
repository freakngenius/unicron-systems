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
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">Work</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          Action items, call logs, decisions, kanban, and sprint tracking. Refusal
          history is in System &rsaquo; Refusal Log.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav className="flex gap-0.5 border-b border-[#1F1F23] mb-6 overflow-x-auto">
        {WORK_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap"
              style={{
                color: isActive ? '#E5E5E7' : 'rgba(229,229,231,0.45)',
                background: isActive ? '#141416' : 'transparent',
              }}
            >
              {WORK_TAB_LABELS[tab]}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: '#FF6B2B' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <div>
        {active === 'action-items' && <ActionItems />}
        {active === 'calls' && <CallsLog />}
        {active === 'decisions' && <DecisionsTimeline />}
        {active === 'kanban' && <KanbanEmbeds />}
        {active === 'sprints' && <SprintsView />}
      </div>
    </div>
  );
}
