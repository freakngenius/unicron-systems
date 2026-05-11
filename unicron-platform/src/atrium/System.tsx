// System.tsx — Sprint 3 Stream D + SY-1 + Sprint 7 Stream C
// Atrium System tab root. 10 sub-sections per v3-system.jsx spec.
// Sprint 7 Stream C: AuditLog, DecayHeatmap, ScheduledJobs wired to live DB.

import { useState } from 'react';
import AgentsGalaxy from './system/AgentsGalaxy';
import TaboosViewer from './system/TaboosViewer';
import RefusalLog from './system/RefusalLog';
import ServicesHealth from './system/ServicesHealth';
import AuditLogComponent from './system/AuditLog';
import DecayHeatmapComponent from './system/DecayHeatmap';
import ScheduledJobsComponent from './system/ScheduledJobs';
import VoiceTabComponent from './system/VoiceTab';
import { AtriumIcon, type AtriumIconName } from './icons';

// ─── Constants ────────────────────────────────────────────────────────────────

type SystemTab =
  | 'Agents' | 'Taboos' | 'Refusal Log' | 'Services'
  | 'Voice'  | 'Decay'  | 'Memory'      | 'Scheduled Jobs'
  | 'Audit Log' | 'Continuity';

// v3-system.jsx:159-168 — sub-tab icons per design source.
const SYSTEM_TABS: { id: SystemTab; icon: AtriumIconName }[] = [
  { id: 'Agents',         icon: 'Brain'   },
  { id: 'Taboos',         icon: 'Lock'    },
  { id: 'Refusal Log',    icon: 'Lock'    },
  { id: 'Services',       icon: 'Compass' },
  { id: 'Voice',          icon: 'Phone'   },
  { id: 'Decay',          icon: 'Pulse'   },
  { id: 'Memory',         icon: 'Search'  },
  { id: 'Scheduled Jobs', icon: 'Now'     },
  { id: 'Audit Log',      icon: 'Doc'     },
  { id: 'Continuity',     icon: 'Book'    },
];

// Pass 2 R7: MEMORY_RESULTS + CONTINUITY_EVENTS hard-coded arrays CUT.
// MemorySearch + ContinuityTimeline rendered as empty states with explicit
// "needs real backend" copy in the sub-tab switch below. Returns when:
//  - Memory  → semantic search RPC over vault embeddings + ledger ships.
//  - Continuity → elder/continuity.md ingestion + queryable ledger ships.
// ScheduledJobs / AuditLog / DecayHeatmap are live-DB components (Sprint 7 C).

// ─── Component ────────────────────────────────────────────────────────────────

export function System() {
  const [active, setActive] = useState<SystemTab>('Agents');

  return (
    <div className="w-full">
      {/* Page header — v3 Geist display */}
      <div className="px-7 pt-6 pb-3">
        <div className="text-[11.5px] text-text-muted mb-1.5">Agents, taboos, audit, continuity</div>
        <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
          System
        </h1>
      </div>

      {/* Sub-tab nav — v3 blue underline */}
      <nav
        className="flex gap-1 px-7 border-b border-border-default overflow-x-auto"
        aria-label="System sub-tabs"
        role="tablist"
      >
        {SYSTEM_TABS.map(({ id: tab, icon }) => {
          const isActive = active === tab;
          const Icon = AtriumIcon[icon];
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`system-panel-${tab.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => setActive(tab)}
              className={`px-3.5 py-3 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                isActive ? 'border-[#6081BE] text-[#6081BE]' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={14} />
              {tab}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <section
        id={`system-panel-${active.replace(/\s+/g, '-').toLowerCase()}`}
        role="tabpanel"
        aria-label={active}
        className="px-7 py-5"
      >
        {active === 'Agents'         && <AgentsGalaxy />}
        {active === 'Taboos'         && <TaboosViewer />}
        {active === 'Refusal Log'    && <RefusalLog />}
        {active === 'Services'       && <ServicesHealth />}
        {active === 'Voice'          && <VoiceTabComponent />}
        {active === 'Decay'          && <DecayHeatmapComponent />}
        {/* Pass 2 R7: MemorySearch (MEMORY_RESULTS hardcoded array) CUT. */}
        {active === 'Memory'         && (
          <div className="bg-bg-card border border-border-default rounded-xl px-6 py-12 text-center">
            <div className="text-[14px] text-text-primary font-semibold mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              Memory search needs a real semantic backend
            </div>
            <div className="text-[12px] text-text-muted max-w-md mx-auto leading-relaxed">
              Pass 2 cut the hard-coded result list. Wire a semantic search RPC over the vault
              embeddings + ledger to return here.
            </div>
          </div>
        )}
        {active === 'Scheduled Jobs' && <ScheduledJobsComponent />}
        {active === 'Audit Log'      && <AuditLogComponent />}
        {/* Pass 2 R7: ContinuityTimeline (CONTINUITY_EVENTS hardcoded array) CUT. */}
        {active === 'Continuity'     && (
          <div className="bg-bg-card border border-border-default rounded-xl px-6 py-12 text-center">
            <div className="text-[14px] text-text-primary font-semibold mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              Continuity needs vault elder/continuity ingestion
            </div>
            <div className="text-[12px] text-text-muted max-w-md mx-auto leading-relaxed">
              Pass 2 cut the hard-coded events list. Returns when the elder agent's
              continuity ledger writes are queryable.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
