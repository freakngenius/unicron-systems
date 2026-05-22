// Expenses.tsx — Money > Expenses sub-tab
// Reads /api/atrium/accounts (Notion Accounts DB mirror). Same source as the
// Money tab Burn metric and the Accounts sub-tab — the three surfaces are
// guaranteed consistent.
//
// One row per paid+active account: name, category, monthly cost, billing
// cadence (Account Type), status. Sorted by monthly equivalent desc. Total
// row at the bottom equals the Burn number.

import { useCallback, useEffect, useState } from 'react';

// ── Types (shape of /api/atrium/accounts response) ────────────────────────────

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

// ── Styling ───────────────────────────────────────────────────────────────────

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

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtUsd2(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthlyEquivalent(row: AccountRow): number {
  const v = row.subscription_usd ?? 0;
  if (row.account_type === 'Yearly') return v / 12;
  return v;
}

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

// ── Main export ───────────────────────────────────────────────────────────────

const COLS = [
  { key: 'service',      label: 'Service',         align: 'left'  as const },
  { key: 'category',     label: 'Category',        align: 'left'  as const },
  { key: 'monthly',      label: 'Monthly cost',    align: 'right' as const },
  { key: 'cadence',      label: 'Billing cadence', align: 'left'  as const },
  { key: 'status',       label: 'Status',          align: 'left'  as const },
];

export function Expenses() {
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
        throw new Error(json.error ?? `Failed to load expenses (HTTP ${res.status})`);
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

  if (loading && !data) {
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
      <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
        <div className="mono text-[11px] uppercase tracking-[0.14em] text-[#E14B4B] mb-1">
          Failed to load
        </div>
        <div className="mono text-[12px] text-[#E14B4B] mb-1">{error}</div>
        {hint && (
          <div className="text-[12px] text-text-secondary mt-2 leading-relaxed">{hint}</div>
        )}
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Server already returns paid sorted by subscription_usd desc. We display
  // monthly equivalents (Yearly ÷ 12) and re-sort by that so the on-screen
  // ordering matches the on-screen monthly numbers.
  const rows = [...data.paid].sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
  const total = data.paid_monthly_equivalent_usd;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.3 }}>
            Expenses
          </h2>
          <div className="text-[11.5px] text-text-muted mt-0.5">
            Source: Notion Accounts · paid + active · monthly equivalents
          </div>
        </div>
        <span className="mono text-[11px] text-text-muted">
          {rows.length} {rows.length === 1 ? 'service' : 'services'}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-border-default rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            No paid + active accounts
          </div>
          <div className="mono text-[11px] text-text-muted mt-1">
            Mark accounts as paid (Subscription &gt; 0) and Active in the Notion Accounts database.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default bg-white">
          <table className="w-full min-w-[720px]">
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
              {rows.map((r) => {
                const monthly = monthlyEquivalent(r);
                return (
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
                    <td className="px-4 py-3"><CategoryChips categories={r.category} /></td>
                    <td className="px-4 py-3 mono text-[12px] text-text-primary text-right tabular-nums whitespace-nowrap">
                      {fmtUsd2(monthly)}
                      {r.account_type === 'Yearly' && (
                        <span className="block mono text-[9px] text-text-muted tabular-nums">
                          {fmtUsd2(r.subscription_usd ?? 0)}/yr
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 mono text-[11px] text-text-secondary whitespace-nowrap">
                      {r.account_type ?? '—'}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  </tr>
                );
              })}
              <tr className="bg-bg-raised">
                <td className="px-4 py-3" colSpan={2}>
                  <span className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                    Total (monthly equivalent)
                  </span>
                </td>
                <td className="px-4 py-3 mono text-[13px] font-semibold text-text-primary text-right tabular-nums whitespace-nowrap">
                  {fmtUsd2(total)}
                </td>
                <td className="px-4 py-3" colSpan={2}>
                  <span className="mono text-[10px] text-text-muted">= Burn (30d, services)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mono text-[10px] text-text-faint">
        Fetched {new Date(data.fetched_at).toLocaleString('en-US')}
      </div>
    </div>
  );
}
