// Campaigns.tsx — Sprint 6 Stream A
// List and create marketing campaigns backed by nervous_system.campaigns.

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'complete';
  goal: string | null;
  channels: string[] | null;
  start_date: string | null;
  end_date: string | null;
  target_metric: string | null;
  owner_team_member_id: string | null;
  notes: string | null;
  ttl_days: number | null;
  created_at: string;
  updated_at: string;
}

// ── Design helpers ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<Campaign['status'], string> = {
  draft:    '#6B7280',
  active:   '#4FB286',
  paused:   '#D9A23A',
  complete: '#6F95D6',
};

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: color + '22', color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Create form ───────────────────────────────────────────────────────────────

const BLANK = {
  name: '',
  status: 'draft' as Campaign['status'],
  goal: '',
  channels: '',
  start_date: '',
  end_date: '',
  target_metric: '',
  notes: '',
};

function CreateCampaignForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/atrium/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          status: form.status,
          goal: form.goal || null,
          channels: form.channels
            ? form.channels.split(',').map((c) => c.trim()).filter(Boolean)
            : null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          target_metric: form.target_metric || null,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to create campaign');
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full bg-bg-card border border-border-default rounded-lg px-3 py-2 mono text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors';
  const labelCls = 'mono text-[9px] uppercase tracking-[0.16em] text-text-muted block mb-1';

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full max-w-md h-full bg-bg-card border-l border-border-default overflow-y-auto flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default sticky top-0 bg-bg-card z-10">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">
            New Campaign
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="mono text-[11px] uppercase tracking-[0.14em] text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 flex-1">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Zedcor Launch"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Campaign['status'] })}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="complete">Complete</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Target metric</label>
              <input
                className={inputCls}
                placeholder="e.g. 10 demos"
                value={form.target_metric}
                onChange={(e) => setForm({ ...form, target_metric: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Goal</label>
            <textarea
              className={inputCls + ' resize-none'}
              rows={2}
              placeholder="What does this campaign need to achieve?"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Channels (comma-separated)</label>
            <input
              className={inputCls}
              placeholder="e.g. LinkedIn, Email, Slack"
              value={form.channels}
              onChange={(e) => setForm({ ...form, channels: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start date</label>
              <input
                className={inputCls}
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>End date</label>
              <input
                className={inputCls}
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className={inputCls + ' resize-none'}
              rows={3}
              placeholder="Additional context"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {err && (
            <div className="bg-[#DD6262]/10 border border-[#DD6262]/30 rounded-lg px-3 py-2">
              <div className="mono text-[11px] text-[#DD6262]">{err}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border-default">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="w-full mono text-[11px] uppercase tracking-[0.12em] py-2.5 bg-accent-orange text-white rounded-lg hover:bg-[#D4652E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '…' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/campaigns');
      const json = (await res.json()) as { campaigns?: Campaign[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load campaigns');
      setCampaigns(json.campaigns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Group: active + draft first, then paused, then complete
  const order: Campaign['status'][] = ['active', 'draft', 'paused', 'complete'];
  const sorted = [...campaigns].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="mono text-[12px] text-text-secondary">
          {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowForm(true)}
          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 bg-accent-orange text-white rounded-lg hover:bg-[#D4652E] transition-colors"
        >
          + New Campaign
        </button>
      </div>

      {/* Empty state */}
      {sorted.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-10 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
            No campaigns yet
          </div>
          <div className="mono text-[11px] text-text-muted mb-4">
            Create your first campaign to start tracking marketing efforts.
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="mono text-[10px] uppercase tracking-[0.12em] px-4 py-2 bg-accent-orange text-white rounded-lg hover:bg-[#D4652E] transition-colors"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-bg-card border-b border-border-default">
                {['Campaign', 'Status', 'Goal', 'Channels', 'Dates', 'Target'].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-text-muted text-left whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="border-b border-border-default hover:bg-bg-raised transition-colors">
                  <td className="px-4 py-3 mono text-[12px] text-text-primary font-medium">
                    {c.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary max-w-[180px] truncate">
                    {c.goal ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.channels && c.channels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.channels.map((ch) => (
                          <span
                            key={ch}
                            className="mono text-[9px] px-1.5 py-0.5 rounded bg-bg-raised text-text-secondary uppercase tracking-[0.08em]"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="mono text-[11px] text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary whitespace-nowrap">
                    {c.start_date || c.end_date
                      ? `${formatDate(c.start_date)} → ${formatDate(c.end_date)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary">
                    {c.target_metric ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CreateCampaignForm
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
