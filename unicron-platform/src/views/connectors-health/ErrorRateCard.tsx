interface Props {
  total: number;
  failed: number;
  rate: number; // 0..1
}

// Threshold for the "elevated" tone — anything > 5% is amber, > 20% red.
function toneFor(rate: number): { label: string; classes: string } {
  if (rate >= 0.2) return { label: 'critical', classes: 'text-rose-400 border-rose-400/40' };
  if (rate >= 0.05) return { label: 'elevated', classes: 'text-accent-gold border-accent-gold/40' };
  return { label: 'nominal', classes: 'text-emerald-400 border-emerald-400/40' };
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function ErrorRateCard({ total, failed, rate }: Props) {
  const tone = toneFor(rate);
  return (
    <section
      data-testid="connectors-error-rate"
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-3"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary">
          24h error rate
        </h2>
        <span
          data-testid="connectors-error-rate-tone"
          className={[
            'mono text-[10px] uppercase tracking-[0.18em] border rounded-md px-2 py-0.5',
            tone.classes,
          ].join(' ')}
        >
          {tone.label}
        </span>
      </header>
      <div className="flex items-baseline gap-2">
        <span
          data-testid="connectors-error-rate-pct"
          className="mono text-[28px] text-text-primary"
        >
          {fmtPct(rate)}
        </span>
        <span className="mono text-[11px] text-text-primary/40">
          {failed} failed / {total} events
        </span>
      </div>
      {total === 0 ? (
        <p
          data-testid="connectors-error-rate-empty"
          className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30"
        >
          no audit-log activity in the last 24h
        </p>
      ) : null}
    </section>
  );
}
