import type { AgentDispatch } from '../../lib/contracts/agentConsole';
import { summarizeDispatch } from '../../lib/agents/auditLogClient';

interface Props {
  rows: ReadonlyArray<AgentDispatch>;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}

export function AuditLogTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="audit-log-empty"
        className="border border-border-default rounded-md bg-bg-panel p-8 text-center"
      >
        <p className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary/40">
          No verified dispatches match these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border-default rounded-md bg-bg-panel overflow-x-auto">
      <table
        data-testid="audit-log-table"
        className="w-full mono text-[12px] text-text-primary"
      >
        <thead>
          <tr className="text-left border-b border-border-default text-text-primary/40 uppercase tracking-[0.14em] text-[10px]">
            <th className="px-3 py-2">Verified by</th>
            <th className="px-3 py-2">Verified at</th>
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2">Org</th>
            <th className="px-3 py-2">Summary</th>
            <th className="px-3 py-2">Dispatch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="audit-log-row"
              data-dispatch-id={row.id}
              className="border-b border-border-default/50 last:border-b-0"
            >
              <td className="px-3 py-2">{row.verified_by_user_id ?? '—'}</td>
              <td className="px-3 py-2 text-text-primary/70">
                {formatTimestamp(row.verified_at)}
              </td>
              <td className="px-3 py-2">{row.agent_name}</td>
              <td className="px-3 py-2 text-text-primary/70">{row.customer_org_id}</td>
              <td className="px-3 py-2 text-text-primary/70">
                {summarizeDispatch(row)}
              </td>
              <td className="px-3 py-2">
                <a
                  href={`/agents?dispatch=${row.id}`}
                  className="text-accent-gold hover:underline"
                  data-testid="audit-log-row-link"
                >
                  {row.id.slice(0, 8)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
