import { Visualizer } from '../visualizer/Visualizer';
import { useSystem } from '../../context/SystemContext';
import { useSettings } from '../SettingsContext';

type Props = {
  onOpenLive: () => void;
};

export function SystemDeployed({ onOpenLive }: Props) {
  const { config } = useSystem();
  const { settings } = useSettings();

  const watcherCount = config.agents.filter((a) => a.layer === 2 && a.enabled).length;
  const processorCount = config.agents.filter((a) => a.layer === 3 && a.enabled).length;
  const synthCount = config.agents.filter((a) => a.layer === 4 && a.enabled).length;
  const sourceCount = config.dataSources.filter((d) => d.enabled).length;

  return (
    <div className="w-full max-w-[800px] px-6 flex flex-col items-center text-center py-12">
      <div className="relative w-[400px] h-[400px]">
        <Visualizer
          config={config}
          showInternalCostMetrics={settings.showInternalCostMetrics}
          reducedMotion={settings.reducedMotion}
          density="compact"
          showHud={false}
        />
      </div>

      <h2 className="text-[28px] leading-[1.2] text-text-primary mt-8 mb-3">
        Live. Watching the world for you.
      </h2>

      <p className="text-[15px] text-text-secondary mb-10 max-w-[560px]">
        {watcherCount} watchers, {processorCount} processors, {synthCount} synthesizers
        deployed across {sourceCount} data sources.
      </p>

      <div className="flex gap-4 mb-10 flex-wrap justify-center">
        <KpiTile value={String(watcherCount)} label="watchers active" />
        <KpiTile value="0" label="reports delivered" />
        <KpiTile value="LIVE" label="system status" gold />
      </div>

      <button
        type="button"
        onClick={onOpenLive}
        className="bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-6 rounded-md hover:bg-text-primary transition-colors"
      >
        OPEN LIVE SYSTEM →
      </button>
    </div>
  );
}

function KpiTile({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-6 min-w-[180px] text-left">
      <div
        className={[
          'text-[28px] leading-none mb-2',
          gold ? 'text-accent-gold' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </div>
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">{label}</div>
    </div>
  );
}
