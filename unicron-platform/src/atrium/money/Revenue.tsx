// Revenue.tsx — Sprint 5 Stream F
// Stripe connector stub + pipeline-weighted forecast from nervous_system.customers.
// If VITE_STRIPE_ENABLED is 'true', shows a "Connect Stripe" placeholder (live
// Stripe API call requires server-side STRIPE_SECRET_KEY — not surfaced to browser).

import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  status: string | null;
  deal_value: number | null;
  arr: number | null;
  mrr: number | null;
  health_score: number | null;
}

// Deal-stage → pipeline weight multiplier
const STAGE_WEIGHT: Record<string, number> = {
  Proposal:  0.5,
  Contract:  0.85,
  Active:    1.0,
  Expansion: 1.0,
};

// ── Stripe stub ───────────────────────────────────────────────────────────────

function StripeStub() {
  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-6 flex items-center justify-between gap-6 flex-wrap">
      <div>
        <div className="mono text-[14px] font-semibold text-[#E5E5E7] mb-1.5">
          Revenue
        </div>
        <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
          No revenue connector configured yet — pre-revenue, pilot in flight.
        </div>
        <div className="mono text-[11px] text-[rgba(229,229,231,0.35)] mt-1">
          Connect Stripe to auto-pull MRR, ARR, and churn data.
        </div>
      </div>
      <button
        className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 bg-[#FF6B2B] text-white rounded-lg hover:bg-[#e55a1a] transition-colors shrink-0"
        onClick={() => alert('Stripe connection — add STRIPE_SECRET_KEY to environment and deploy /api/atrium/stripe-mrr endpoint.')}
      >
        Connect Stripe
      </button>
    </div>
  );
}

// ── Pipeline forecast ─────────────────────────────────────────────────────────

function PipelineTable({ customers }: { customers: Customer[] }) {
  const pipeline = customers.filter(
    (c) => c.status && STAGE_WEIGHT[c.status] !== undefined,
  );

  if (pipeline.length === 0) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
          No pipeline customers
        </div>
        <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
          Customers in Proposal or Contract status will appear here.
        </div>
      </div>
    );
  }

  const totalWeighted = pipeline.reduce((sum, c) => {
    const val = c.deal_value ?? c.arr ?? 0;
    const w = STAGE_WEIGHT[c.status ?? ''] ?? 0;
    return sum + val * w;
  }, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">
          Pipeline-weighted forecast
        </span>
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] text-[rgba(229,229,231,0.35)]">Weighted total</span>
          <span className="mono text-[14px] font-semibold text-[#22C55E] tabular-nums">
            ${Math.round(totalWeighted).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#1F1F23]">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="bg-[#141416] border-b border-[#1F1F23]">
              {['Customer', 'Stage', 'Deal Value', 'Weight', 'Weighted'].map((h, i) => (
                <th
                  key={i}
                  className={[
                    'px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)]',
                    i >= 2 ? 'text-right' : 'text-left',
                  ].join(' ')}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pipeline.map((c) => {
              const val = c.deal_value ?? c.arr ?? 0;
              const weight = STAGE_WEIGHT[c.status ?? ''] ?? 0;
              const weighted = val * weight;
              return (
                <tr
                  key={c.id}
                  className="border-b border-[#1F1F23] hover:bg-[#1A1A1D] transition-colors"
                >
                  <td className="px-4 py-3 mono text-[12px] text-[#E5E5E7]">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="mono text-[10px] px-2 py-0.5 rounded-full bg-[#FF6B2B]/15 text-[#FF6B2B] uppercase tracking-[0.08em]">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-[12px] text-[#E5E5E7] text-right tabular-nums">
                    {val ? `$${val.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-[rgba(229,229,231,0.5)] text-right">
                    {Math.round(weight * 100)}%
                  </td>
                  <td className="px-4 py-3 mono text-[12px] text-[#22C55E] text-right tabular-nums">
                    ${Math.round(weighted).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Revenue() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabase();
      const { data, error: err } = await sb
        .schema('nervous_system')
        .from('customers')
        .select('id, name, status, deal_value, arr, mrr, health_score')
        .in('status', ['Proposal', 'Contract', 'Active', 'Expansion'])
        .returns<Customer[]>();

      if (err) throw err;
      setCustomers(data ?? []);
    } catch (e) {
      // customers table may not have deal_value — show empty state gracefully
      setCustomers([]);
      const msg = e instanceof Error ? e.message : String(e);
      // Only surface as error if it's not a "column does not exist" type issue
      if (!msg.includes('does not exist') && !msg.includes('undefined')) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Stripe stub — always shown since STRIPE_SECRET_KEY is not present */}
      <StripeStub />

      {/* Pipeline forecast */}
      <div>
        <div className="mono text-[10px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)] mb-3">
          Pipeline
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 bg-[#141416] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-4 py-3">
            <div className="mono text-[11px] text-[#EF4444]">{error}</div>
          </div>
        ) : (
          <PipelineTable customers={customers} />
        )}
      </div>
    </div>
  );
}
