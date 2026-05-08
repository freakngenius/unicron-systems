// System.tsx — Sprint 3 Stream D
// Atrium System tab root. 4 sub-sections: Agents, Taboos, Refusal Log, Services.

import { useState } from 'react';
import AgentsGalaxy from './system/AgentsGalaxy';
import TaboosViewer from './system/TaboosViewer';
import RefusalLog from './system/RefusalLog';
import ServicesHealth from './system/ServicesHealth';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_TABS = ['Agents', 'Taboos', 'Refusal Log', 'Services'] as const;
type SystemTab = (typeof SYSTEM_TABS)[number];

// ─── Component ────────────────────────────────────────────────────────────────

export function System() {
  const [active, setActive] = useState<SystemTab>('Agents');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">System</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          Configure agents, review taboos, audit refused actions, and monitor service health.
        </p>
      </div>

      {/* Sub-tab nav */}
      <nav className="flex gap-0.5 border-b border-[#1F1F23] mb-6">
        {SYSTEM_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative"
              style={{
                color: isActive ? '#E5E5E7' : 'rgba(229,229,231,0.45)',
                background: isActive ? '#141416' : 'transparent',
              }}
            >
              {tab}
              {/* Active underline */}
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
        {active === 'Agents' && <AgentsGalaxy />}
        {active === 'Taboos' && <TaboosViewer />}
        {active === 'Refusal Log' && <RefusalLog />}
        {active === 'Services' && <ServicesHealth />}
      </div>
    </div>
  );
}
