import { ConnectorStatusBadge } from './ConnectorStatusBadge';
import type { ConnectorHealthRow } from '../../lib/contracts/connectorsHealth';

interface Props {
  rows: ConnectorHealthRow[];
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const ageMs = Date.now() - ms;
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function MostRecentSuccessTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section
        data-testid="connectors-recent-success-empty"
        className="border border-border-default border-dashed rounded-md bg-bg-panel/50 p-6 flex flex-col items-center gap-2"
      >
        <span className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary/40">
          no connectors registered
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
          ship one via Settings → Connectors to populate this view
        </span>
      </section>
    );
  }

  return (
    <section
      data-testid="connectors-recent-success"
      className="border border-border-default rounded-md bg-bg-panel"
    >
      <header className="px-4 py-3 border-b border-border-default flex items-baseline justify-between">
        <h2 className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary">
          Most recent success
        </h2>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          {rows.length} connector{rows.length === 1 ? '' : 's'}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left mono text-[11px]">
          <thead>
            <tr className="text-text-primary/40 uppercase tracking-[0.18em] text-[10px]">
              <th className="px-4 py-2 font-normal">Customer</th>
              <th className="px-4 py-2 font-normal">Type</th>
              <th className="px-4 py-2 font-normal">Account</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Last success</th>
              <th className="px-4 py-2 font-normal">Last error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.connector_id}
                data-testid="connectors-recent-success-row"
                data-connector-id={r.connector_id}
                className="border-t border-border-default/60"
              >
                <td className="px-4 py-2 text-text-primary truncate">
                  {r.customer_org_id}
                </td>
                <td className="px-4 py-2 text-text-primary/70">{r.type}</td>
                <td className="px-4 py-2 text-text-primary/70 truncate max-w-[14rem]">
                  {r.account_name ?? '—'}
                </td>
                <td className="px-4 py-2">
                  <ConnectorStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-text-primary/70">
                  {fmtRelative(r.last_success_at)}
                </td>
                <td className="px-4 py-2 text-text-primary/50 truncate max-w-[18rem]">
                  {r.last_error_message ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
