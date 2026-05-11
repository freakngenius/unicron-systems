// CashOnHandCard.tsx — S5b
// Renders the latest nervous_system.cash_balance row + an inline form to
// record a new manual entry via ns_money_cash_set. Plaid sync is a
// follow-up; for now manual entry is the default path.

import { useEffect, useState, type FormEvent } from 'react';
import { getSupabase } from '../../lib/supabase';

interface CashRow {
  balance_usd: number | string;
  source: string;
  note: string | null;
  observed_at: string;
}

function fmtUsd(n: number, compact = true): string {
  if (!compact) return `$${n.toLocaleString()}`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function CashOnHandCard() {
  const [latest, setLatest] = useState<CashRow | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const { data } = await getSupabase().rpc('ns_money_cash_latest');
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as CashRow) : null;
    setLatest(row);
  };

  useEffect(() => { void refresh(); }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = parseFloat(amount.replace(/[$,]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a non-negative dollar amount.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: rpcErr } = await getSupabase().rpc('ns_money_cash_set', {
        p_balance_usd: parsed,
        p_note: note.trim() || null,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      setAmount('');
      setNote('');
      setEditing(false);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const value = latest && latest.balance_usd != null ? Number(latest.balance_usd) : null;
  const observedLabel = latest
    ? `as of ${new Date(latest.observed_at).toLocaleDateString()} · ${latest.source}`
    : 'No entry yet · manual';

  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold">
          Cash on hand
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-[10px] text-text-muted hover:text-text-primary"
        >
          {editing ? 'Cancel' : 'Update'}
        </button>
      </div>

      {!editing && (
        <>
          <div
            className="text-[26px] font-semibold text-text-primary mt-2"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, lineHeight: 1 }}
          >
            {value === null ? '—' : fmtUsd(value)}
          </div>
          <div className="text-[12px] text-text-muted mt-2.5 truncate">
            {observedLabel}
            {latest?.note && ` · ${latest.note}`}
          </div>
        </>
      )}

      {editing && (
        <form onSubmit={onSubmit} className="mt-2 space-y-2">
          <div>
            <label className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              Balance (USD)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="125000"
              className="w-full mt-1 bg-transparent border border-border-default rounded-md px-2 py-1.5 mono text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
            />
          </div>
          <div>
            <label className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="end-of-month bank statement"
              className="w-full mt-1 bg-transparent border border-border-default rounded-md px-2 py-1.5 mono text-[11px] text-text-secondary focus:outline-none focus:border-[#6081BE]"
            />
          </div>
          {error && <div className="mono text-[10px] text-red-500">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md text-white disabled:opacity-50"
            style={{ background: '#6081BE' }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}
