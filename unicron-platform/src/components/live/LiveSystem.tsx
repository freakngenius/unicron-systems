import { useMemo, useState } from 'react';
import { Visualizer } from '../visualizer/Visualizer';
import { useSettings } from '../SettingsContext';
import { useSystem } from '../../context/SystemContext';
import { ActivityFeed } from './ActivityFeed';
import { ActionBar, type ActivePanel } from './ActionBar';
import { AddAgentPanel } from './panels/AddAgentPanel';
import { AddSourcePanel } from './panels/AddSourcePanel';
import { EditNodePanel } from './panels/EditNodePanel';
import { useAgentRuns } from '../../lib/agentRuns';
import { useRealHud } from '../../lib/hud';
import type { AgentDef } from '../../context/SystemContext';

type Props = {
  onArchitectClick: () => void;
  onGoToOnboarding: () => void;
};

// Wave 3 Phase B: cost summary now flows through the same-origin proxy
// (`/api/cost-summary-proxy`) which injects `ARCHITECT_API_TOKEN` server-side.
// The legacy `VITE_COST_SUMMARY_URL` env var is ignored — proxy path is fixed.
const COST_SUMMARY_URL = '/api/cost-summary-proxy';

/** Resolve an `agent_runs.agent_name` (e.g. 'ranker') to the matching
 *  SystemConfig agent id (e.g. 'a-ranker') so the visualizer can pulse the
 *  right node. Falls back to null when no role matches. */
function resolveAgentId(agentName: string, agents: AgentDef[]): string | null {
  const needle = agentName.toLowerCase();
  const direct = agents.find((a) => a.role.toLowerCase() === needle);
  if (direct) return direct.id;
  const fuzzy = agents.find(
    (a) => a.role.toLowerCase().includes(needle) || needle.includes(a.role.toLowerCase()),
  );
  return fuzzy?.id ?? null;
}

export function LiveSystem({ onArchitectClick, onGoToOnboarding }: Props) {
  const { settings } = useSettings();
  const { config } = useSystem();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { lastPulse } = useAgentRuns();
  const { hud } = useRealHud(COST_SUMMARY_URL);

  const pulseSignal = useMemo(() => {
    if (!lastPulse) return null;
    const agentId = resolveAgentId(lastPulse.agentName, config.agents);
    return agentId ? { agentId, key: lastPulse.key } : null;
  }, [lastPulse, config.agents]);

  const togglePanel = (id: NonNullable<ActivePanel>) => {
    setActivePanel((curr) => (curr === id ? null : id));
  };

  const close = () => setActivePanel(null);

  if (config.status === 'unconfigured') {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-6">
        <div className="bg-bg-card border border-border-default rounded-lg p-10 max-w-[480px] text-center">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-3">
            NO SYSTEM CONFIGURED
          </div>
          <p className="text-[15px] text-text-primary mb-6 leading-relaxed">
            You haven't deployed a system yet. Define what signals you want to capture and the
            Architect will design it.
          </p>
          <button
            type="button"
            onClick={onGoToOnboarding}
            className="bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md hover:bg-text-primary transition-colors"
          >
            START IN ONBOARDING →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-56px)]">
      <ActionBar active={activePanel} onToggle={togglePanel} />

      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] min-h-[calc(100vh-56px)]">
        <section className="relative border-r border-border-default min-h-[60vh]">
          <Visualizer
            config={config}
            showInternalCostMetrics={settings.showInternalCostMetrics}
            reducedMotion={settings.reducedMotion}
            density="full"
            showHud
            pulseSignal={pulseSignal}
            hudOverride={hud}
            onNodeClick={(agentId) => {
              setSelectedAgentId(agentId);
              setActivePanel('edit-node');
            }}
          />
        </section>

        <aside className="px-6 py-10 overflow-y-auto">
          {settings.activityFeed ? (
            <ActivityFeed onArchitectClick={onArchitectClick} />
          ) : (
            <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary">
              activity feed disabled · enable in settings
            </div>
          )}
        </aside>
      </div>

      <AddAgentPanel open={activePanel === 'add-agent'} onClose={close} />
      <AddSourcePanel open={activePanel === 'add-source'} onClose={close} />
      <EditNodePanel
        open={activePanel === 'edit-node'}
        onClose={close}
        selectedAgentId={selectedAgentId}
        onAgentUpdated={() => {
          /* Visualizer reflects updated config via the `config` prop. */
        }}
      />
    </div>
  );
}
