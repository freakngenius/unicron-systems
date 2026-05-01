import { useState } from 'react';
import { LivingIntelligenceFrame } from './LivingIntelligenceFrame';
import { useSettings } from '../SettingsContext';
import { useSystem } from '../../context/SystemContext';
import { ActivityFeed } from './ActivityFeed';
import { ActionBar, type ActivePanel } from './ActionBar';
import { AddAgentPanel } from './panels/AddAgentPanel';
import { AddSourcePanel } from './panels/AddSourcePanel';
import { EditNodePanel } from './panels/EditNodePanel';

type Props = {
  onArchitectClick: () => void;
  onGoToOnboarding: () => void;
};

export function LiveSystem({ onArchitectClick, onGoToOnboarding }: Props) {
  const { settings } = useSettings();
  const { config } = useSystem();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  // selectedAgentId stays null because the canvas now lives in an iframe; the
  // Edit Node panel falls back to a default agent when nothing is selected.
  const selectedAgentId: string | null = null;
  const togglePanel = (id: NonNullable<ActivePanel>) => {
    setActivePanel((curr) => (curr === id ? null : id));
  };

  const close = () => setActivePanel(null);

  const handleAgentUpdated = (_agentId: string) => {
    // Live pulse on the iframe will be added once postMessage carries config diffs.
    // For now the system config update lands silently.
  };

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
          <LivingIntelligenceFrame
            showInternalCostMetrics={settings.showInternalCostMetrics}
            reducedMotion={settings.reducedMotion}
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
        onAgentUpdated={handleAgentUpdated}
      />
    </div>
  );
}
