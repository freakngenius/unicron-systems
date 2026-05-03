import type { AuditLogTimeWindow } from '../../lib/agents/auditLogClient';

export interface AuditLogFilterState {
  verifiedBy: string;
  agentName: string;
  window: AuditLogTimeWindow;
}

interface Props {
  value: AuditLogFilterState;
  onChange: (next: AuditLogFilterState) => void;
  /** Optional list of known agent names. When provided, agent filter is a select. */
  agentOptions?: ReadonlyArray<string>;
}

const WINDOW_OPTIONS: ReadonlyArray<{ value: AuditLogTimeWindow; label: string }> = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: 'all', label: 'All time' },
];

export function AuditLogFilters({ value, onChange, agentOptions }: Props) {
  const set = <K extends keyof AuditLogFilterState>(key: K, v: AuditLogFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div
      data-testid="audit-log-filters"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4"
    >
      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          Operator email
        </span>
        <input
          data-testid="audit-log-filter-verified-by"
          type="text"
          value={value.verifiedBy}
          onChange={(e) => set('verifiedBy', e.target.value)}
          placeholder="kyle@…"
          className="bg-bg-panel border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          Agent
        </span>
        {agentOptions && agentOptions.length > 0 ? (
          <select
            data-testid="audit-log-filter-agent"
            value={value.agentName}
            onChange={(e) => set('agentName', e.target.value)}
            className="bg-bg-panel border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary"
          >
            <option value="">All agents</option>
            {agentOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            data-testid="audit-log-filter-agent"
            type="text"
            value={value.agentName}
            onChange={(e) => set('agentName', e.target.value)}
            placeholder="agent-name"
            className="bg-bg-panel border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary"
          />
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          Time window
        </span>
        <select
          data-testid="audit-log-filter-window"
          value={value.window}
          onChange={(e) => set('window', e.target.value as AuditLogTimeWindow)}
          className="bg-bg-panel border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary"
        >
          {WINDOW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
