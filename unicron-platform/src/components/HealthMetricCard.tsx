import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string;
  delta?: string;
  tone?: 'default' | 'emerald' | 'gold' | 'rose' | 'muted';
  hint?: string;
  children?: ReactNode;
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-text-primary',
  emerald: 'text-emerald-400',
  gold: 'text-accent-gold',
  rose: 'text-rose-400',
  muted: 'text-text-primary/60',
};

export function HealthMetricCard({ label, value, delta, tone = 'default', hint, children }: Props) {
  return (
    <div
      data-testid="health-metric-card"
      data-tone={tone}
      className="flex flex-col gap-2 border border-border-default rounded-md bg-bg-panel p-3"
    >
      <span className="mono text-[9px] uppercase tracking-[0.18em] text-text-primary/40">{label}</span>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`mono text-[20px] ${TONE_CLASS[tone]}`}>{value}</span>
        {delta ? (
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            {delta}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <span className="mono text-[10px] tracking-[0.04em] text-text-primary/30">{hint}</span>
      ) : null}
    </div>
  );
}
