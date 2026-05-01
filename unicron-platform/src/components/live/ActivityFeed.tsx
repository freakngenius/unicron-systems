import { useEffect, useState } from 'react';
import {
  useActivityFeed,
  formatTimestamp,
  formatRowText,
  dotColorFor,
} from '../../lib/activity';
import type { DotColor } from '../../data/mocks';

type Props = {
  onArchitectClick: () => void;
};

const dotClass: Record<DotColor, string> = {
  cyan: 'bg-accent-cyan',
  gold: 'bg-accent-gold',
  magenta: 'bg-accent-magenta',
  violet: 'bg-accent-violet',
  white: 'bg-text-primary',
};

export function ActivityFeed({ onArchitectClick }: Props) {
  const { rows, loading, error } = useActivityFeed();
  const [now, setNow] = useState(() => Date.now());

  // Re-render relative timestamps every 15s so "12s ago" stays accurate
  // without doing a Realtime round-trip.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const lastUpdate = rows[0]?.ts;

  return (
    <div className="flex flex-col h-full">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary mb-4">
        RECENT ACTIVITY
      </div>

      {loading && (
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary py-3">
          loading activity…
        </div>
      )}

      {error && !loading && (
        <div className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3 mb-3">
          activity feed error: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary py-3 border border-dashed border-border-default rounded-md text-center">
          no activity yet
        </div>
      )}

      <div className="flex flex-col">
        {rows.map((row, i) => {
          const color = dotColorFor(row.agent_name);
          // Highlight the most recent row to mirror the prior demo affordance.
          const highlight = i === 0;
          return (
            <button
              key={row.id}
              type="button"
              onClick={onArchitectClick}
              className={[
                'flex items-center gap-3 py-2.5 px-3 rounded-md text-left transition-colors',
                highlight
                  ? 'bg-bg-card border border-border-default'
                  : 'border border-transparent hover:bg-bg-card/60',
                'cursor-pointer',
              ].join(' ')}
            >
              <span
                className={['w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass[color]].join(' ')}
              />
              <span className="mono text-[11px] text-text-primary flex-1 leading-tight">
                {formatRowText(row)}
              </span>
              <span className="mono text-[11px] text-text-secondary flex-shrink-0">
                {formatTimestamp(row.ts, now)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 bg-bg-card border border-border-default rounded-lg p-4">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-3">
          ARCHITECT
        </div>
        <div className="mono text-[12px] text-text-primary space-y-1.5">
          <Stat k="status" v={loading ? '—' : error ? 'error' : 'active'} highlight />
          {/* Real proposal counts land in Gate C3 once Stream D's Architect API ships. */}
          <Stat k="proposals" v="—" />
          <Stat k="last update" v={lastUpdate ? formatTimestamp(lastUpdate, now) : '—'} />
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-text-secondary">{k}</span>
      <span className={highlight ? 'text-accent-gold' : 'text-text-primary'}>{v}</span>
    </div>
  );
}
