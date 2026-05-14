import { Visualizer } from '../visualizer/Visualizer';
import { useSystem } from '../../context/SystemContext';
import { useSettings } from '../SettingsContext';
import type { AgentDef } from '../../context/SystemContext';

type Props = {
  onOpenLive: () => void;
  /**
   * Optional count of data sources successfully onboarded by the parent
   * dispatch. When omitted, falls back to the count of enabled sources in
   * `SystemConfig` so the tile is never empty during the demo flow.
   */
  sourcesConnected?: number;
};

export function SystemDeployed({ onOpenLive, sourcesConnected }: Props) {
  const { config } = useSystem();
  const { settings } = useSettings();

  const agents = config.agents.filter((a) => a.enabled);
  const groups = groupAgentsByType(agents);
  const totalAgents = agents.length;
  const sourceCount =
    sourcesConnected ?? config.dataSources.filter((d) => d.enabled).length;

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
        Cluster Built
      </h2>

      <div className="text-[64px] leading-none text-text-primary mb-2">
        {totalAgents}
      </div>
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary mb-6">
        agents deployed
      </div>

      <p className="text-[13px] text-text-secondary mb-10 max-w-[640px]">
        {groups
          .map((g) => `${g.count} ${g.count === 1 ? g.singular : g.plural}`)
          .join(' | ')}
      </p>

      <div className="flex gap-4 mb-10 flex-wrap justify-center">
        <KpiTile value={String(totalAgents)} label="agents active" />
        <KpiTile value={String(sourceCount)} label="data sources connected" />
        <KpiTile value="LIVE" label="system status" gold />
      </div>

      <button
        type="button"
        onClick={onOpenLive}
        className="bg-accent-primary text-white mono text-[12px] tracking-[0.12em] uppercase py-3 px-6 rounded-md hover:bg-accent-primary/90 transition-colors"
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

interface AgentGroup {
  singular: string;
  plural: string;
  count: number;
}

function groupAgentsByType(agents: AgentDef[]): AgentGroup[] {
  const buckets = new Map<string, AgentGroup>();
  for (const a of agents) {
    const singular = roleSuffix(a.role);
    const key = singular.toLowerCase();
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, {
        singular,
        plural: pluralize(singular),
        count: 1,
      });
    }
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

function roleSuffix(role: string): string {
  const parts = role.match(/[A-Z][a-z0-9]*/g);
  if (!parts || parts.length === 0) return role;
  return parts[parts.length - 1];
}

function pluralize(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
