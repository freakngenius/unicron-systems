// CostSpikes.tsx — Sprint 5 Stream F
// Cost anomaly list from GET /api/atrium/cost-spikes.
// "Acknowledge" button → POST /api/atrium/cost-spikes with the spike id.

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostSpike {
  id: string;
  ts: string;
  category: string;
  service: string;
  baseline_amount: number;
  spike_amount: number;
  spike_ratio: number;
  reason: string;
  acknowledged: boolean;
}

// ── Spike row ─────────────────────────────────────────────────────────────────

function SpikeRow({
  spike,
  onAck,
}: {
  spike: CostSpike;
  onAck: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleAck() {
    setBusy(true);
    setErr(null);
    try {
      await onAck(spike.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const isHigh = spike.spike_ratio >= 2;

  return (
    <div
      className={[
        'flex items-center gap-4 px-5 py-4',
        spike.acknowledged ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Indicator dot */}
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: spike.acknowledged ? 'rgba(255,255,255,0.07)' : isHigh ? '#DD6262' : '#D9A23A' }}
      />

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="mono text-[13px] text-text-primary font-medium">
            {spike.service}
          </span>
          <span
            className="mono text-[11px] font-semibold"
            style={{ color: spike.acknowledged ? 'var(--text-lo)' : isHigh ? '#DD6262' : '#D9A23A' }}
          >
            {spike.spike_ratio.toFixed(1)}x baseline
          </span>
          <span className="mono text-[10px] text-text-muted">
            {new Date(spike.ts).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="mono text-[12px] text-text-secondary mt-1">
          Baseline{' '}
          <span className="text-text-secondary">
            ${spike.baseline_amount.toLocaleString()}
          </span>
          {' → '}
          <span
            style={{ color: spike.acknowledged ? 'var(--text-md)' : isHigh ? '#DD6262' : '#D9A23A' }}
          >
            ${spike.spike_amount.toLocaleString()}
          </span>
          {spike.reason && (
            <>
              {' · '}
              <span className="text-text-muted">{spike.reason}</span>
            </>
          )}
        </div>

        {err && (
          <div className="mono text-[10px] text-[#DD6262] mt-1">{err}</div>
        )}
      </div>

      {/* Action */}
      {spike.acknowledged ? (
        <span className="mono text-[11px] text-status-green font-semibold shrink-0 flex items-center gap-1.5">
          <span>✓</span> Acknowledged
        </span>
      ) : (
        <button
          onClick={() => void handleAck()}
          disabled={busy}
          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border border-border-default rounded-lg text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 shrink-0"
        >
          {busy ? '…' : 'Acknowledge'}
        </button>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function CostSpikes() {
  const [spikes, setSpikes] = useState<CostSpike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/cost-spikes');
      const json = (await res.json()) as { spikes?: CostSpike[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Load failed');
      setSpikes(json.spikes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAck(id: string) {
    const res = await fetch('/api/atrium/cost-spikes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? 'Acknowledge failed');
    // Optimistic update
    setSpikes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, acknowledged: true } : s)),
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#DD6262]/10 border border-[#DD6262]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#DD6262]">{error}</div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const active = spikes.filter((s) => !s.acknowledged).length;

  if (spikes.length === 0) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
          No cost anomalies detected
        </div>
        <div className="mono text-[11px] text-text-muted">
          The system will surface spikes here when daily spend deviates significantly from baseline.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
          Cost spike alerts
        </span>
        {active > 0 && (
          <span className="mono text-[10px] px-2 py-0.5 rounded-full bg-[#DD6262]/15 text-[#DD6262] font-semibold">
            {active} active
          </span>
        )}
      </div>

      {/* Spikes list */}
      <div className="border border-border-default rounded-xl overflow-hidden divide-y divide-border-default">
        {spikes.map((spike) => (
          <SpikeRow key={spike.id} spike={spike} onAck={handleAck} />
        ))}
      </div>
    </div>
  );
}
