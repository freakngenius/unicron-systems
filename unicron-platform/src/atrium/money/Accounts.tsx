// Accounts.tsx — Atrium Money → Accounts view
// Read-only mirror of the Notion Accounts database. Credentials columns
// (API / Email / PW / Username) are NEVER fetched, so they cannot render.
//
// Source: /api/atrium/accounts (server queries Notion with NOTION_TOKEN).
// Grouping: Paid (Subscription > 0) above Free/Trial. Paid section is sorted
// by subscription desc with a monthly-equivalent subtotal (Yearly ÷ 12).

import { useCallback, useEffect, useMemo, useState } from 'react';

type AccountRow = {
  notion_page_id: string;
  notion_url: string | null;
  service: string;
  status: 'Active' | 'Paused' | 'Canceled' | null;
  category: string[];
  subscription_usd: number | null;
  account_type: 'Monthly' | 'Yearly' | '1-time' | 'API' | 'Free' | null;
  last_billed: string | null;
  start_date: string | null;
  notes: string | null;
};

type AccountsResponse = {
  notion_url: string;
  paid: AccountRow[];
  free: AccountRow[];
  paid_total_usd: number;
  paid_monthly_equivalent_usd: number;
  fetched_at: string;
};

// ── Styling helpers ──────────────────────────────────────────────────────────

const STATUS_TINT: Record<NonNullable<AccountRow['status']>, { bg: string; fg: string }> = {
  Active:   { bg: 'rgba(46, 142, 102, 0.12)',  fg: '#2E8E66' },
  Paused:   { bg: 'rgba(194, 138, 31, 0.14)',  fg: '#C28A1F' },
  Canceled: { bg: 'rgba(225, 75, 75, 0.12)',   fg: '#E14B4B' },
};

const CATEGORY_TINT: Record<string, string> = {
  AI:             '#7C3AED',
  Communication:  '#E8763A',
  Infrastructure: '#6081BE',
  Integration:    '#46506A',
  Pathfinder:     '#E8763A',
};

function catColor(name: string): string {
  return CATEGORY_TINT[name] ?? '#7E8AA3';
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return '—'; }
}

// ── Pills & chips ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: AccountRow['status'] }) {
  if (!status) return <span className="text-text-muted mono text-[11px]">—</span>;
  const tint = STATUS_TINT[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full mono text-[10px] uppercase tracking-[0.1em] font-semibold"
      style={{ background: tint.bg, color: tint.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint.fg }} />
      {status}
    </span>
  );
}

function CategoryChips({ categories }: { categories: string[] }) {
  if (categories.length === 0) return <span className="text-text-muted mono text-[11px]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((c) => {
        const color = catColor(c);
        return (
          <span
            key={c}
            className="mono text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.08em]"
            style={{ background: color + '22', color }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

const COLS = [
  { key: 'service',      label: 'Service',      align: 'left'  as const },
  { key: 'status',       label: 'Status',       align: 'left'  as const },
  { key: 'category',     label: 'Category',     align: 'left'  as const },
  { key: 'subscription', label: 'Subscription', align: 'right' as const },
  { key: 'account_type', label: 'Account Type', align: 'left'  as const },
  { key: 'last_billed',  label: 'Last Billed',  align: 'left'  as const },
  { key: 'start_date',   label: 'Start Date',   align: 'left'  as const },
  { key: 'notes',        label: 'Notes',        align: 'left'  as const },
];

function AccountsTable({ rows, emptyMessage }: { rows: AccountRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border-default rounded-xl px-5 py-6 text-center">
        <div className="mono text-[11px] text-text-muted">{emptyMessage}</div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border-default bg-white">
      <table className="w-full min-w-[920px]">
        <thead>
          <tr className="border-b border-border-default">
            {COLS.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-text-muted whitespace-nowrap text-${c.align}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.notion_page_id} className="border-b border-border-default last:border-b-0 hover:bg-bg-raised transition-colors">
              <td className="px-4 py-3 text-[13px] text-text-primary font-medium">
                {r.notion_url ? (
                  <a href={r.notion_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {r.service}
                  </a>
                ) : (
                  r.service
                )}
              </td>
              <td className="px-4 py-3"><StatusPill status={r.status} /></td>
              <td className="px-4 py-3"><CategoryChips categories={r.category} /></td>
              <td className="px-4 py-3 mono text-[12px] text-text-primary text-right tabular-nums whitespace-nowrap">
                {fmtUsd(r.subscription_usd)}
              </td>
              <td className="px-4 py-3 mono text-[11px] text-text-secondary whitespace-nowrap">
                {r.account_type ?? '—'}
              </td>
              <td className="px-4 py-3 mono text-[11px] text-text-secondary whitespace-nowrap">
                {fmtDate(r.last_billed)}
              </td>
              <td className="px-4 py-3 mono text-[11px] text-text-secondary whitespace-nowrap">
                {fmtDate(r.start_date)}
              </td>
              <td className="px-4 py-3 text-[11px] text-text-muted max-w-[280px] truncate" title={r.notes ?? undefined}>
                {r.notes ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function Accounts() {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/atrium/accounts');
      const json = (await res.json()) as Partial<AccountsResponse> & { error?: string; hint?: string };
      if (!res.ok) {
        setHint(json.hint ?? null);
        throw new Error(json.error ?? `Failed to load accounts (HTTP ${res.status})`);
      }
      setData(json as AccountsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const notionUrl = data?.notion_url ?? 'https://www.notion.so/futuroso/350785c67e728039b4eee158a72bf35c';

  const headerRight = useMemo(() => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void load()}
        disabled={loading}
        className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border border-border-default rounded-lg text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50"
      >
        {loading ? '…' : 'Reload'}
      </button>
      <a
        href={notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 bg-[#6081BE] text-white rounded-lg hover:bg-[#4F6EA8] transition-colors"
      >
        Open in Notion →
      </a>
    </div>
  ), [loading, load, notionUrl]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.3 }}>
            Accounts
          </h2>
          <div className="text-[11.5px] text-text-muted mt-0.5">
            Source: Notion · read-only mirror
          </div>
        </div>
        {headerRight}
      </div>

      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
          <div className="mono text-[11px] uppercase tracking-[0.14em] text-[#E14B4B] mb-1">
            Failed to load
          </div>
          <div className="mono text-[12px] text-[#E14B4B] mb-1">{error}</div>
          {hint && (
            <div className="text-[12px] text-text-secondary mt-2 leading-relaxed">
              {hint}
            </div>
          )}
          <button
            onClick={() => void load()}
            className="mono text-[10px] uppercase tracking-[0.12em] mt-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {data && !error && (
        <>
          {/* Paid section */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-baseline gap-3">
                <h3 className="text-[14px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
                  Paid accounts
                </h3>
                <span className="mono text-[11px] text-text-muted">
                  {data.paid.length} {data.paid.length === 1 ? 'service' : 'services'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Monthly equivalent</span>
                  <span className="mono text-[14px] text-text-primary font-semibold tabular-nums">
                    {fmtUsd(data.paid_monthly_equivalent_usd)}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted">As quoted</span>
                  <span className="mono text-[12px] text-text-secondary tabular-nums">
                    {fmtUsd(data.paid_total_usd)}
                  </span>
                </div>
              </div>
            </div>
            <AccountsTable rows={data.paid} emptyMessage="No paid accounts." />
          </section>

          {/* Free / Trial section */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-baseline gap-3">
                <h3 className="text-[14px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
                  Free / Trial accounts
                </h3>
                <span className="mono text-[11px] text-text-muted">
                  {data.free.length} {data.free.length === 1 ? 'service' : 'services'}
                </span>
              </div>
            </div>
            <AccountsTable rows={data.free} emptyMessage="No free or trial accounts." />
          </section>

          <div className="mono text-[10px] text-text-faint">
            Fetched {new Date(data.fetched_at).toLocaleString('en-US')}
          </div>
        </>
      )}
    </div>
  );
}
