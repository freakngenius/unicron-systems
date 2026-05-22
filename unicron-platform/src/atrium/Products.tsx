// Products.tsx — Pass 2 (R6): cut fiction, wire real verifier accuracy.
//
// SLOT MATRIX (Pass 2 R6):
//  - Active tenants · status: CUT · pathfinder.tenants table does not exist;
//    pathfinder.customers tracks customers not multi-tenant orgs.
//  - Leads ranked (wk) · status: CUT · pathfinder.leads table does not exist
//    in this Supabase project; the lead-ingest pipeline writes to Pathfinder's
//    own Vercel project DB, not this nervous_system one.
//  - Reply rate · status: CUT · no outbound reply tracker schema.
//  - Verifier accuracy · status: real · ns_pathfinder_verifier_accuracy_30d
//    over pathfinder.agent_runs (agent_name='verifier').
//  - Sub-tabs Pathfinder / Metacron · status: KEPT (real, vault + DB backed
//    via PathfinderProduct + MetacronProduct subcomponents).

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { PathfinderProduct } from './products/PathfinderProduct';
import { MetacronProduct } from './products/MetacronProduct';
import { VoiceTab } from './products/voice/VoiceTab';
import { AtriumIcon, type AtriumIconName } from './icons';

type ProductsTab = 'pathfinder' | 'metacron' | 'voice';

// v3-products.jsx:294-295 — Pathfinder→Compass, Metacron→Layers.
// Voice Agents added as Sprint 5 Stream A foundation merge (spec §2).
// Sub-tab is gated by Atrium's existing VITE_ATRIUM_EMAIL_ALLOWLIST sign-in.
// Server-side requireVoiceAccess (api/_lib/voiceAuth.ts) is the real gate.
const PRODUCTS_TABS: { id: ProductsTab; label: string; icon: AtriumIconName }[] = [
  { id: 'pathfinder', label: 'Pathfinder',   icon: 'Compass' },
  { id: 'metacron',   label: 'Metacron',     icon: 'Layers'  },
  { id: 'voice',      label: 'Voice Agents', icon: 'Phone'   },
];

// Atrium audit fix item #12 — was a one-shot mount fetch with no refresh path;
// now supports a manual refresh trigger and 30s polling so the dashboard
// doesn't go stale on long-open tabs.
function useVerifierAccuracy(refreshKey: number): {
  total: number | null;
  accuracyPct: number | null;
  loadedAt: number | null;
} {
  const [s, setS] = useState<{ total: number | null; accuracyPct: number | null; loadedAt: number | null }>({
    total: null, accuracyPct: null, loadedAt: null,
  });
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_pathfinder_verifier_accuracy_30d')
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as Array<{ total: number; successful: number; accuracy_pct: number }> | null)?.[0];
        if (row) {
          setS({ total: Number(row.total), accuracyPct: Number(row.accuracy_pct), loadedAt: Date.now() });
        } else {
          setS((prev) => ({ ...prev, loadedAt: Date.now() }));
        }
      })
      .catch(() => {/* leave nulls */});
    return () => { cancelled = true; };
  }, [refreshKey]);
  return s;
}

function MetricCard({ label, value, sublabel, accent }: {
  label: string; value: string; sublabel?: string; accent?: string;
}) {
  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold">{label}</div>
      <div className="text-[26px] font-semibold text-text-primary mt-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, lineHeight: 1, color: accent ?? undefined }}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[12px] text-text-muted mt-2.5 truncate">{sublabel}</div>
      )}
    </div>
  );
}

export function Products() {
  const [active, setActive] = useState<ProductsTab>('pathfinder');
  // Atrium audit fix item #12 — bump refreshKey to refetch metrics + signal
  // child views to refetch. 30s background poll keeps the dashboard fresh.
  const [refreshKey, setRefreshKey] = useState(0);
  const verifier = useVerifierAccuracy(refreshKey);

  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  function loadedAgo(loadedAt: number | null): string {
    if (loadedAt === null) return 'never';
    const s = Math.round((Date.now() - loadedAt) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    return `${m}m ago`;
  }

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Pathfinder & Metacron</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            Products
          </h1>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11px] text-text-muted">
            Last refresh: {loadedAgo(verifier.loadedAt)}
          </span>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh Products metrics"
            className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-border-default bg-white hover:bg-bg-elevated transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="px-7 pb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <MetricCard
          label="Verifier accuracy (30d)"
          value={verifier.accuracyPct === null ? '—' : `${verifier.accuracyPct}%`}
          sublabel={verifier.total === null ? '—' : verifier.total === 0 ? 'No verifier runs in last 30d' : `${verifier.total} verifier runs (30d)`}
          accent="#2E8E66"
        />
      </div>

      <div className="flex gap-1 px-7 border-b border-border-default overflow-x-auto">
        {PRODUCTS_TABS.map((tab) => {
          const isActive = active === tab.id;
          const Icon = AtriumIcon[tab.icon];
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3.5 py-3 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                isActive ? 'border-[#6081BE] text-[#6081BE]' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-7 py-5">
        <section role="tabpanel" aria-label={PRODUCTS_TABS.find((t) => t.id === active)?.label}>
          {active === 'pathfinder' && <PathfinderProduct />}
          {active === 'metacron' && <MetacronProduct />}
          {active === 'voice' && <VoiceTab />}
        </section>
      </div>
    </div>
  );
}
