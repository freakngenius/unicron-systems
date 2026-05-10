// Expenses.tsx — Sprint 5 Stream F
// Categorized monthly expense view.
// Categories: infrastructure | ai | communication | payroll | contractors |
//             marketing | other
// Groups connected_services rows by category, plus manual line items.
// A "Manual" badge appears on entries without last_billed_at.

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectedService {
  id: string;
  name: string;
  category: string | null;
  monthly_cost_usd: number | null;
  last_billed_at: string | null;
  notes: string | null;
  status: string;
}

// ── Category config (matching v3-money.jsx color palette) ─────────────────────

const CATEGORIES: Array<{ id: string; label: string; color: string }> = [
  { id: 'infrastructure', label: 'Infrastructure',  color: '#6F95D6' },
  { id: 'ai',            label: 'AI / LLM',         color: '#7C3AED' },
  { id: 'communication', label: 'Communication',    color: 'var(--accent)' },
  { id: 'payroll',       label: 'Payroll',          color: '#D9A23A' },
  { id: 'contractors',   label: 'Contractors',      color: '#EC4899' },
  { id: 'marketing',     label: 'Marketing',        color: '#C026D3' },
  { id: 'other',         label: 'Other',            color: '#6B7280' },
];

function isManual(svc: ConnectedService): boolean {
  return !svc.last_billed_at || (svc.notes?.toLowerCase().includes('manual') ?? false);
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  cat,
  services,
}: {
  cat: (typeof CATEGORIES)[0];
  services: ConnectedService[];
}) {
  const [open, setOpen] = useState(true);
  const total = services.reduce((s, svc) => s + (svc.monthly_cost_usd ?? 0), 0);

  if (services.length === 0) return null;

  return (
    <div className="border border-border-default rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-card hover:bg-bg-raised transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: cat.color }}
          />
          <span className="mono text-[11px] font-semibold text-text-primary uppercase tracking-[0.12em]">
            {cat.label}
          </span>
          <span className="mono text-[10px] text-text-muted">
            {services.length} {services.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="mono text-[13px] font-semibold text-text-primary tabular-nums">
            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
          </span>
          <span
            className="mono text-[10px] text-text-muted"
            style={{ transform: open ? 'none' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 200ms ease' }}
          >
            ▾
          </span>
        </div>
      </button>

      {open && (
        <div>
          {services.map((svc, i) => (
            <div
              key={svc.id}
              className={[
                'flex items-center gap-3 px-4 py-2.5',
                i < services.length - 1 ? 'border-b border-border-default' : '',
              ].join(' ')}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="mono text-[12px] text-text-primary">{svc.name}</span>
                  {isManual(svc) && (
                    <span className="mono text-[9px] px-1.5 py-0.5 rounded bg-[#D9A23A]/15 text-[#D9A23A] uppercase tracking-[0.08em]">
                      Manual
                    </span>
                  )}
                </div>
                {svc.notes && (
                  <div className="mono text-[10px] text-text-muted mt-0.5 truncate max-w-[400px]">
                    {svc.notes}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {svc.last_billed_at && (
                  <span className="mono text-[10px] text-text-muted">
                    Billed{' '}
                    {new Date(svc.last_billed_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
                <span className="mono text-[12px] text-text-primary tabular-nums min-w-[70px] text-right">
                  {svc.monthly_cost_usd != null
                    ? `$${svc.monthly_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </span>
              </div>
            </div>
          ))}

          {/* Category total */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-default bg-[#0D0D0F]">
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              {cat.label} total
            </span>
            <span
              className="mono text-[12px] font-semibold tabular-nums"
              style={{ color: cat.color }}
            >
              ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Expenses() {
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/connected-services');
      const json = (await res.json()) as {
        services?: ConnectedService[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Load failed');
      // Exclude sentinel/meta rows
      const real = (json.services ?? []).filter(
        (s) => s.name !== '__runway_config__' && s.category !== '__meta__',
      );
      setServices(real);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-bg-card rounded-xl animate-pulse" />
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

  // Bucket services by category
  const buckets = new Map<string, ConnectedService[]>();
  for (const svc of services) {
    const cat = svc.category ?? 'other';
    const key = CATEGORIES.find((c) => c.id === cat) ? cat : 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(svc);
  }

  const grandTotal = services.reduce((sum, s) => sum + (s.monthly_cost_usd ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Category sections */}
      {CATEGORIES.map((cat) => (
        <CategorySection
          key={cat.id}
          cat={cat}
          services={buckets.get(cat.id) ?? []}
        />
      ))}

      {services.length === 0 && (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            No expenses tracked
          </div>
          <div className="mono text-[11px] text-text-muted mt-1">
            Register services in the Accounts tab to track expenses.
          </div>
        </div>
      )}

      {/* Grand total */}
      {grandTotal > 0 && (
        <div className="flex justify-end pt-2">
          <div className="bg-bg-card border border-border-default rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Grand total
            </span>
            <span className="mono text-[14px] font-semibold text-text-primary tabular-nums">
              ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
