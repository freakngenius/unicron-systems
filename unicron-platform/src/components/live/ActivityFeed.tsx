import { activityFeed, type DotColor } from '../../data/mocks';

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
  return (
    <div className="flex flex-col h-full">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary mb-4">
        RECENT ACTIVITY
      </div>

      <div className="flex flex-col">
        {activityFeed.map((row, i) => {
          const clickable = row.action === 'inbox';
          return (
            <button
              key={i}
              type="button"
              onClick={clickable ? onArchitectClick : undefined}
              className={[
                'flex items-center gap-3 py-2.5 px-3 rounded-md text-left transition-colors',
                row.highlight
                  ? 'bg-bg-card border border-border-default'
                  : 'border border-transparent hover:bg-bg-card/60',
                clickable ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
            >
              <span
                className={['w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass[row.color]].join(' ')}
              />
              <span className="mono text-[11px] text-text-primary flex-1 leading-tight">
                {row.text}
              </span>
              <span className="mono text-[11px] text-text-secondary flex-shrink-0">{row.time}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 bg-bg-card border border-border-default rounded-lg p-4">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-3">
          ARCHITECT
        </div>
        <div className="mono text-[12px] text-text-primary space-y-1.5">
          <Stat k="status" v="active" highlight />
          <Stat k="proposals" v="3 pending" />
          <Stat k="last update" v="8m ago" />
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
