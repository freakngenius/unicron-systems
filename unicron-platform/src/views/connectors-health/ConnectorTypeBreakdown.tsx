import {
  CONNECTOR_TYPES_HEALTH,
  type ConnectorType,
} from '../../lib/contracts/connectorsHealth';

interface Props {
  byType: Record<ConnectorType, number>;
  total: number;
}

const TYPE_LABEL: Record<ConnectorType, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  hubspot: 'HubSpot',
  other: 'Other',
};

export function ConnectorTypeBreakdown({ byType, total }: Props) {
  return (
    <section
      data-testid="connectors-by-type"
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-3"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary">
          By type
        </h2>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          {total} total
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {CONNECTOR_TYPES_HEALTH.map((type) => {
          const count = byType[type] ?? 0;
          const pct = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <li
              key={type}
              data-testid="connectors-by-type-row"
              data-type={type}
              className="flex items-center justify-between gap-3 mono text-[12px] text-text-primary"
            >
              <span className="truncate">{TYPE_LABEL[type]}</span>
              <span className="text-text-primary/60 mono text-[11px]">
                {count} <span className="text-text-primary/30">· {pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
