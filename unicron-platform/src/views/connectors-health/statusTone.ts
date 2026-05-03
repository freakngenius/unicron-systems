import type { ConnectorHealthStatus } from '../../lib/contracts/connectorsHealth';

// Color mapping per the stream brief:
//   active   = green
//   expired  = amber
//   error    = red
//   unknown  = neutral
// Additional canonical statuses (`pending`, `disconnected`, `revoked`)
// reuse the closest semantic tone — pending → amber (transient), revoked
// → red (failure terminal), disconnected → neutral (no signal yet).
export const STATUS_TONE: Record<ConnectorHealthStatus, string> = {
  active: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/5',
  pending: 'text-accent-gold border-accent-gold/40 bg-accent-gold/5',
  expired: 'text-accent-gold border-accent-gold/40 bg-accent-gold/5',
  error: 'text-rose-400 border-rose-400/40 bg-rose-400/5',
  revoked: 'text-rose-400 border-rose-400/40 bg-rose-400/5',
  disconnected: 'text-text-primary/50 border-text-primary/20 bg-text-primary/5',
  unknown: 'text-text-primary/50 border-text-primary/20 bg-text-primary/5',
};

export function toneFor(status: ConnectorHealthStatus): string {
  return STATUS_TONE[status];
}
