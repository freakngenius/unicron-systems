// Runway.tsx — Sprint 5 Stream F
// Cash on hand (editable), monthly burn (auto + manual payroll), runway months,
// and a burn-down SVG chart (Recharts NOT required — using inline SVG matching
// v3-money.jsx pattern which also uses SVG, not a chart library).
//
// Persistence: uses a dedicated connected_services row with name='__runway_config__'
// to store cash_on_hand and payroll values as JSON in the notes field.
// This avoids a separate config table.

import { useState, useEffect, useCallback } from 'react';

interface ConnectedService {
  id: string;
  name: string;
  monthly_cost_usd: number | null;
  category: string | null;
  notes: string | null;
}

interface RunwayConfig {
  cash_on_hand: number;
  manual_payroll: number;
}

const CONFIG_SENTINEL = '__runway_config__';

// ── Runway chart (SVG, matching v3-money.jsx pattern) ────────────────────────

function RunwayChart({
  cashOnHand,
  monthlyBurn,
}: {
  cashOnHand: number;
  monthlyBurn: number;
}) {
  const W = 800;
  const H = 240;
  const padL = 56;
  const padR = 24;
  const padT = 24;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Generate 24-month projection
  const months: Array<{ label: string; cash: number }> = [];
  const now = new Date();
  let cash = cashOnHand;
  const burn = monthlyBurn > 0 ? monthlyBurn : 1;

  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    cash = Math.max(0, cash - burn);
    months.push({ label, cash });
  }

  const maxCash = cashOnHand;
  const endIdx = months.findIndex((m) => m.cash <= 0);
  const runwayMonths = endIdx >= 0 ? endIdx : months.length;

  const pts = months.map((m, i) => [
    padL + (i / (months.length - 1)) * innerW,
    padT + (1 - m.cash / (maxCash || 1)) * innerH,
  ]);

  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
  const fillD = `${pathD} L ${pts[pts.length - 1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`;
  const endX =
    endIdx >= 0
      ? padL + (endIdx / (months.length - 1)) * innerW
      : null;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">
          24-month burn-down
        </span>
        <span className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
          Runway:{' '}
          <span
            className="font-semibold"
            style={{
              color:
                runwayMonths > 12
                  ? '#22C55E'
                  : runwayMonths > 6
                  ? '#F59E0B'
                  : '#EF4444',
            }}
          >
            {runwayMonths >= months.length
              ? `${months.length}+ months`
              : `${runwayMonths} months`}
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H, display: 'block' }}
        role="img"
        aria-label="Runway burn-down chart"
      >
        {gridLines.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + t * innerH}
              y2={padT + t * innerH}
              stroke="rgba(255,255,255,0.06)"
            />
            <text
              x={padL - 8}
              y={padT + t * innerH + 4}
              textAnchor="end"
              fontSize="10"
              fill="rgba(229,229,231,0.35)"
            >
              ${Math.round(((1 - t) * maxCash) / 1000)}k
            </text>
          </g>
        ))}

        {/* Fill */}
        <path d={fillD} fill="#3B82F6" opacity={0.1} />
        {/* Line */}
        <path d={pathD} stroke="#3B82F6" strokeWidth="2" fill="none" />

        {/* Runway-end vertical */}
        {endX !== null && (
          <g>
            <line
              x1={endX}
              x2={endX}
              y1={padT}
              y2={padT + innerH}
              stroke="#EF4444"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <text
              x={endX}
              y={padT - 7}
              textAnchor="middle"
              fontSize="11"
              fill="#EF4444"
              fontWeight="600"
            >
              Runway end
            </text>
          </g>
        )}

        {/* Month labels */}
        {months
          .filter((_, i) => i % 3 === 0)
          .map((m, qi) => {
            const i = qi * 3;
            const x = padL + (i / (months.length - 1)) * innerW;
            return (
              <text
                key={i}
                x={x}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(229,229,231,0.35)"
              >
                {m.label}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Runway() {
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [config, setConfig] = useState<RunwayConfig>({
    cash_on_hand: 0,
    manual_payroll: 0,
  });
  const [configId, setConfigId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields (string for input binding)
  const [cashInput, setCashInput] = useState('');
  const [payrollInput, setPayrollInput] = useState('');

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

      const all = json.services ?? [];
      const configRow = all.find((s) => s.name === CONFIG_SENTINEL);
      const realServices = all.filter(
        (s) => s.name !== CONFIG_SENTINEL && s.category !== '__meta__',
      );
      setServices(realServices);

      if (configRow) {
        setConfigId(configRow.id);
        try {
          const parsed = JSON.parse(configRow.notes ?? '{}') as Partial<RunwayConfig>;
          const cash = parsed.cash_on_hand ?? 0;
          const payroll = parsed.manual_payroll ?? 0;
          setConfig({ cash_on_hand: cash, manual_payroll: payroll });
          setCashInput(String(cash));
          setPayrollInput(String(payroll));
        } catch {
          setCashInput('0');
          setPayrollInput('0');
        }
      } else {
        setCashInput('0');
        setPayrollInput('0');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const servicesBurn = services.reduce(
    (sum, s) => sum + (s.monthly_cost_usd ?? 0),
    0,
  );
  const totalBurn = servicesBurn + config.manual_payroll;
  const runwayMonths = totalBurn > 0 ? Math.floor(config.cash_on_hand / totalBurn) : 999;

  async function saveConfig() {
    const cash = parseFloat(cashInput) || 0;
    const payroll = parseFloat(payrollInput) || 0;
    setSaving(true);
    setError(null);

    const notes = JSON.stringify({ cash_on_hand: cash, manual_payroll: payroll });

    try {
      if (configId) {
        // Update existing sentinel row
        const res = await fetch(`/api/atrium/connected-services/${configId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Save failed');
      } else {
        // Create sentinel row
        const res = await fetch('/api/atrium/connected-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: CONFIG_SENTINEL,
            category: '__meta__',
            status: 'unknown',
            notes,
          }),
        });
        const json = (await res.json()) as { service?: { id: string }; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Save failed');
        if (json.service) setConfigId(json.service.id);
      }
      setConfig({ cash_on_hand: cash, manual_payroll: payroll });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const runwayColor =
    runwayMonths > 12 ? '#22C55E' : runwayMonths > 6 ? '#F59E0B' : '#EF4444';

  const inputCls =
    'bg-[#141416] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] focus:outline-none focus:border-[#FF6B2B] transition-colors w-full';

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-4 py-3">
          <div className="mono text-[11px] text-[#EF4444]">{error}</div>
        </div>
      )}

      {/* Inputs + big numbers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cash on hand */}
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-4">
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
            Cash on hand
          </div>
          <input
            className={inputCls}
            type="number"
            min="0"
            step="1000"
            placeholder="0"
            value={cashInput}
            onChange={(e) => setCashInput(e.target.value)}
            onBlur={() => void saveConfig()}
          />
          <div className="mono text-[11px] text-[rgba(229,229,231,0.35)] mt-1.5">
            e.g. 524000
          </div>
        </div>

        {/* Payroll (manual) */}
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-4">
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
            Monthly payroll (manual)
          </div>
          <input
            className={inputCls}
            type="number"
            min="0"
            step="100"
            placeholder="0"
            value={payrollInput}
            onChange={(e) => setPayrollInput(e.target.value)}
            onBlur={() => void saveConfig()}
          />
          <div className="mono text-[11px] text-[rgba(229,229,231,0.35)] mt-1.5">
            Contractors, salary
          </div>
        </div>

        {/* Runway big number */}
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-4 flex flex-col justify-between">
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
            Runway
          </div>
          <div>
            <div
              className="mono text-[42px] font-semibold leading-none"
              style={{ color: runwayColor }}
            >
              {runwayMonths >= 999 ? '∞' : runwayMonths}
            </div>
            <div className="mono text-[11px] text-[rgba(229,229,231,0.4)] mt-1">
              months · ${totalBurn.toLocaleString()}/mo burn
            </div>
          </div>
        </div>
      </div>

      {/* Burn breakdown */}
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-4">
        <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-3">
          Burn breakdown
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="mono text-[12px] text-[rgba(229,229,231,0.6)]">
              Connected services ({services.length})
            </span>
            <span className="mono text-[12px] text-[#E5E5E7] tabular-nums">
              ${servicesBurn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
            </span>
          </div>
          <div className="flex justify-between">
            <span className="mono text-[12px] text-[rgba(229,229,231,0.6)]">
              Payroll (manual)
            </span>
            <span className="mono text-[12px] text-[#E5E5E7] tabular-nums">
              ${config.manual_payroll.toLocaleString()}/mo
            </span>
          </div>
          <div className="h-px bg-[#1F1F23] my-1" />
          <div className="flex justify-between">
            <span className="mono text-[11px] font-semibold text-[#E5E5E7]">
              Total burn
            </span>
            <span className="mono text-[12px] font-semibold text-[#E5E5E7] tabular-nums">
              ${totalBurn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
            </span>
          </div>
        </div>
      </div>

      {/* Save button (explicit, in addition to onBlur) */}
      <div className="flex justify-end">
        <button
          onClick={() => void saveConfig()}
          disabled={saving}
          className="mono text-[10px] uppercase tracking-[0.12em] px-4 py-2 bg-[#FF6B2B] text-white rounded-lg hover:bg-[#e55a1a] transition-colors disabled:opacity-40"
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>

      {/* Burn-down chart */}
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-5">
        <RunwayChart cashOnHand={config.cash_on_hand} monthlyBurn={totalBurn} />
      </div>
    </div>
  );
}
