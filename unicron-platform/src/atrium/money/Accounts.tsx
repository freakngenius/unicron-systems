// Accounts.tsx — Sprint 5 Stream F
// Connected services list + register form.
// Loads from GET /api/atrium/connected-services.
// POST via the same endpoint to register a new service.

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectedService {
  id: string;
  name: string;
  category: string | null;
  status: 'healthy' | 'degraded' | 'broken' | 'unknown';
  monthly_cost_usd: number | null;
  last_billed_at: string | null;
  last_health_check_at: string | null;
  owner_team_member_id: string | null;
  config_url: string | null;
  notes: string | null;
  acknowledged: boolean;
  created_at: string;
  updated_at: string;
}

// ── Design helpers ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<ConnectedService['status'], string> = {
  healthy:  '#22C55E',
  degraded: '#F59E0B',
  broken:   '#EF4444',
  unknown:  'rgba(229,229,231,0.3)',
};

const STATUS_LABEL: Record<ConnectedService['status'], string> = {
  healthy:  'Healthy',
  degraded: 'Degraded',
  broken:   'Broken',
  unknown:  'Unknown',
};

const CAT_COLORS: Record<string, string> = {
  infrastructure: '#3B82F6',
  ai:             '#7C3AED',
  communication:  '#FF6B2B',
  payroll:        '#F59E0B',
  contractors:    '#EC4899',
  marketing:      '#C026D3',
  other:          '#6B7280',
};

function catColor(cat: string | null) {
  return cat ? (CAT_COLORS[cat] ?? CAT_COLORS['other']) : CAT_COLORS['other'];
}

// ── Register Form ─────────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: '',
  category: '',
  status: 'unknown' as ConnectedService['status'],
  monthly_cost_usd: '',
  config_url: '',
  notes: '',
};

function RegisterForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/atrium/connected-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category || null,
          status: form.status,
          monthly_cost_usd: form.monthly_cost_usd ? Number(form.monthly_cost_usd) : null,
          config_url: form.config_url || null,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to register service');
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full bg-[#141416] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[12px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#FF6B2B] transition-colors';
  const labelCls = 'mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] block mb-1';

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Panel */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full max-w-md h-full bg-[#141416] border-l border-[#1F1F23] overflow-y-auto flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F1F23] sticky top-0 bg-[#141416] z-10">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)]">
            Register Service
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="mono text-[11px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 flex-1">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Linear"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select
                className={inputCls}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">—</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="ai">AI</option>
                <option value="communication">Communication</option>
                <option value="payroll">Payroll</option>
                <option value="contractors">Contractors</option>
                <option value="marketing">Marketing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as ConnectedService['status'] })
                }
              >
                <option value="unknown">Unknown</option>
                <option value="healthy">Healthy</option>
                <option value="degraded">Degraded</option>
                <option value="broken">Broken</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Monthly cost (USD)</label>
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.monthly_cost_usd}
              onChange={(e) => setForm({ ...form, monthly_cost_usd: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Config / Dashboard URL</label>
            <input
              className={inputCls}
              type="url"
              placeholder="https://"
              value={form.config_url}
              onChange={(e) => setForm({ ...form, config_url: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className={inputCls + ' resize-none'}
              rows={3}
              placeholder="What does this service do?"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {err && (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
              <div className="mono text-[11px] text-[#EF4444]">{err}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#1F1F23]">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="w-full mono text-[11px] uppercase tracking-[0.12em] py-2.5 bg-[#FF6B2B] text-white rounded-lg hover:bg-[#e55a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '…' : 'Register Service'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Accounts() {
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/connected-services');
      const json = (await res.json()) as { services?: ConnectedService[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load services');
      setServices(json.services ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalMonthly = services.reduce(
    (sum, s) => sum + (s.monthly_cost_usd ?? 0),
    0,
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
            {services.length} services
          </span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 bg-[#FF6B2B] text-white rounded-lg hover:bg-[#e55a1a] transition-colors"
        >
          + Register Service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            No services registered
          </div>
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
            Click "Register Service" to add the first service.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1F1F23]">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-[#141416] border-b border-[#1F1F23]">
                {['Service', 'Status', 'Category', 'Monthly', 'Last Billed', 'Notes', ''].map(
                  (h, i) => (
                    <th
                      key={i}
                      className={[
                        'px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] whitespace-nowrap',
                        i === 3 ? 'text-right' : 'text-left',
                      ].join(' ')}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr
                  key={svc.id}
                  className="border-b border-[#1F1F23] hover:bg-[#1A1A1D] transition-colors"
                >
                  <td className="px-4 py-3 mono text-[12px] text-[#E5E5E7] font-medium">
                    {svc.name}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: STATUS_DOT[svc.status] }}
                      />
                      <span
                        className="mono text-[10px] uppercase tracking-[0.1em]"
                        style={{ color: STATUS_DOT[svc.status] }}
                      >
                        {STATUS_LABEL[svc.status]}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {svc.category && (
                      <span
                        className="mono text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.08em]"
                        style={{
                          background: catColor(svc.category) + '22',
                          color: catColor(svc.category),
                        }}
                      >
                        {svc.category}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 mono text-[12px] text-[#E5E5E7] text-right tabular-nums">
                    {svc.monthly_cost_usd != null
                      ? `$${svc.monthly_cost_usd.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}`
                      : '—'}
                  </td>

                  <td className="px-4 py-3 mono text-[11px] text-[rgba(229,229,231,0.5)]">
                    {svc.last_billed_at
                      ? new Date(svc.last_billed_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </td>

                  <td className="px-4 py-3 mono text-[11px] text-[rgba(229,229,231,0.4)] max-w-[200px] truncate">
                    {svc.notes ?? '—'}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {svc.config_url && (
                      <a
                        href={svc.config_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-[10px] text-[#3B82F6] hover:underline"
                      >
                        Open ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Total footer */}
      <div className="mt-4 flex justify-end">
        <div className="bg-[#141416] border border-[#1F1F23] rounded-lg px-4 py-2.5 flex items-center gap-3">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">
            Total monthly
          </span>
          <span className="mono text-[14px] text-[#E5E5E7] font-semibold tabular-nums">
            ${totalMonthly.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {showForm && (
        <RegisterForm
          onSuccess={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
