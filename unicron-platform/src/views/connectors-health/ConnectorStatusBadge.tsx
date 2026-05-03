import type { ConnectorHealthStatus } from '../../lib/contracts/connectorsHealth';
import { STATUS_TONE } from './statusTone';

interface Props {
  status: ConnectorHealthStatus;
}

export function ConnectorStatusBadge({ status }: Props) {
  return (
    <span
      data-testid="connector-status-badge"
      data-status={status}
      className={[
        'mono inline-flex items-center text-[10px] uppercase tracking-[0.18em] border rounded-md px-2 py-0.5',
        STATUS_TONE[status],
      ].join(' ')}
    >
      {status}
    </span>
  );
}
