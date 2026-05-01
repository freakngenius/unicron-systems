import { useSystem, type AgentDef } from '../../../../context/SystemContext';

type Props = {
  agent?: AgentDef;
};

export function EditNodeOverview({ agent }: Props) {
  const { config } = useSystem();

  const inputAgents = (agent?.inputFrom ?? [])
    .map((id) => config.agents.find((a) => a.id === id))
    .filter((a): a is AgentDef => !!a);
  const outputAgents = (agent?.outputTo ?? [])
    .map((id) => config.agents.find((a) => a.id === id))
    .filter((a): a is AgentDef => !!a);

  const passRatePct = agent ? `${(agent.passRate * 100).toFixed(0)}%` : '·';
  const dwellSec = agent ? `${(agent.dwellMs / 1000).toFixed(1)}s` : '·';

  // Mock event count derived from agent id so it's stable but feels real.
  const mockEventsProcessed = agent
    ? 800 +
      ([...agent.id].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 600)
    : 1247;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="EVENTS PROCESSED" value={mockEventsProcessed.toLocaleString()} />
        <Stat label="PASS RATE" value={passRatePct} />
        <Stat label="AVG DWELL" value={dwellSec} />
        <Stat label="INSTANCE STATE" value="idle" />
      </div>

      <div className="bg-bg-card border border-border-default rounded-lg p-4 space-y-5">
        <div>
          <div className="mono text-[11px] tracking-[0.22em] text-accent-gold uppercase mb-3">
            INPUT FROM
          </div>
          {inputAgents.length === 0 ? (
            <div className="mono text-[12px] text-text-secondary">intake (no upstream agents)</div>
          ) : (
            <div className="space-y-2">
              {inputAgents.map((a, i) => (
                <NodeRow
                  key={a.id}
                  label={a.role}
                  sub={`${(900 + i * 117).toLocaleString()} events forwarded`}
                />
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mono text-[11px] tracking-[0.22em] text-accent-gold uppercase mb-3">
            OUTPUT TO
          </div>
          {outputAgents.length === 0 ? (
            <div className="mono text-[12px] text-text-secondary">delivery (routes to center)</div>
          ) : (
            <div className="space-y-2">
              {outputAgents.map((a, i) => (
                <NodeRow
                  key={a.id}
                  label={a.role}
                  sub={`${(300 + i * 87).toLocaleString()} events forwarded`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-md p-4">
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary mb-1.5">
        {label}
      </div>
      <div className="mono text-[18px] text-text-primary">{value}</div>
    </div>
  );
}

function NodeRow({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-accent-gold text-[11px]">◆</span>
      <span className="mono text-[12px] text-text-primary">{label}</span>
      <span className="mono text-[11px] text-text-secondary ml-1">· {sub}</span>
    </div>
  );
}
