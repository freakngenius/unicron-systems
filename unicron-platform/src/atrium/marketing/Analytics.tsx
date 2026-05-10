// Analytics.tsx — Sprint 6 Stream A
// Marketing analytics surface.
// - If VITE_POSTHOG_KEY is set: renders PostHog embed instructions.
// - Otherwise: shows placeholder with setup CTA.
// - Conversion funnels: placeholder with PostHog/Plausible CTA.
// - Social reach: manual entry form stub (UI only, no backend required).

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SocialEntry {
  platform: string;
  followers: string;
  reach: string;
  engagement: string;
  asOf: string;
}

// ── Social reach form ─────────────────────────────────────────────────────────

const BLANK_SOCIAL: SocialEntry = {
  platform: '',
  followers: '',
  reach: '',
  engagement: '',
  asOf: new Date().toISOString().slice(0, 10),
};

function SocialReach() {
  const [entries, setEntries] = useState<SocialEntry[]>([]);
  const [form, setForm] = useState<SocialEntry>(BLANK_SOCIAL);
  const [showForm, setShowForm] = useState(false);

  function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.platform.trim()) return;
    setEntries([...entries, form]);
    setForm(BLANK_SOCIAL);
    setShowForm(false);
  }

  const inputCls =
    'w-full bg-[#141416] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[12px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#FF6B2B] transition-colors';
  const labelCls = 'mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] block mb-1';

  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)]">
          Social Reach
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="mono text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 bg-[#1F1F23] text-[rgba(229,229,231,0.5)] rounded-lg hover:text-[#E5E5E7] transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addEntry} className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Platform *</label>
              <input
                className={inputCls}
                placeholder="e.g. LinkedIn"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>As of date</label>
              <input
                className={inputCls}
                type="date"
                value={form.asOf}
                onChange={(e) => setForm({ ...form, asOf: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Followers</label>
              <input
                className={inputCls}
                placeholder="0"
                value={form.followers}
                onChange={(e) => setForm({ ...form, followers: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Reach (30d)</label>
              <input
                className={inputCls}
                placeholder="0"
                value={form.reach}
                onChange={(e) => setForm({ ...form, reach: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Engagement %</label>
              <input
                className={inputCls}
                placeholder="0.0"
                value={form.engagement}
                onChange={(e) => setForm({ ...form, engagement: e.target.value })}
              />
            </div>
          </div>
          <button
            type="submit"
            className="mono text-[10px] uppercase tracking-[0.12em] px-4 py-2 bg-[#FF6B2B] text-white rounded-lg hover:bg-[#e55a1a] transition-colors"
          >
            Save Entry
          </button>
        </form>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-5">
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
            No social reach data entered yet.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1F1F23]">
                {['Platform', 'Followers', 'Reach 30d', 'Engagement', 'As of'].map((h) => (
                  <th
                    key={h}
                    className="pb-2 mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)] text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-b border-[#1F1F23]">
                  <td className="py-2.5 mono text-[12px] text-[#E5E5E7]">{entry.platform}</td>
                  <td className="py-2.5 mono text-[12px] text-[rgba(229,229,231,0.6)] tabular-nums">
                    {entry.followers || '—'}
                  </td>
                  <td className="py-2.5 mono text-[12px] text-[rgba(229,229,231,0.6)] tabular-nums">
                    {entry.reach || '—'}
                  </td>
                  <td className="py-2.5 mono text-[12px] text-[rgba(229,229,231,0.6)] tabular-nums">
                    {entry.engagement ? `${entry.engagement}%` : '—'}
                  </td>
                  <td className="py-2.5 mono text-[11px] text-[rgba(229,229,231,0.4)]">
                    {entry.asOf || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Analytics placeholder ─────────────────────────────────────────────────────

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

function AnalyticsConnect() {
  if (POSTHOG_KEY) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-5">
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] mb-2">
          PostHog Connected
        </div>
        <div className="mono text-[12px] text-[rgba(229,229,231,0.6)] mb-3">
          PostHog key detected. Embed the PostHog dashboard or use the JS SDK to render
          funnel and retention charts directly in this panel.
        </div>
        <a
          href="https://app.posthog.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mono text-[11px] text-[#3B82F6] hover:underline"
        >
          Open PostHog dashboard ↗
        </a>
      </div>
    );
  }

  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-5">
      <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-3">
        Analytics not yet connected
      </div>
      <p className="mono text-[12px] text-[rgba(229,229,231,0.5)] mb-4">
        Connect PostHog or Plausible to surface pageviews, funnels, and retention.
      </p>
      <div className="space-y-2">
        <SetupStep
          step={1}
          label="Install PostHog"
          code="npm install posthog-js"
        />
        <SetupStep
          step={2}
          label="Set env var"
          code="VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx"
        />
        <SetupStep
          step={3}
          label="Re-deploy"
          code="vercel --prod"
        />
      </div>
      <div className="mt-4 flex gap-3">
        <a
          href="https://posthog.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 bg-[#7C3AED] text-white rounded-lg hover:bg-[#6d28d9] transition-colors"
        >
          PostHog ↗
        </a>
        <a
          href="https://plausible.io"
          target="_blank"
          rel="noopener noreferrer"
          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 bg-[#1F1F23] text-[rgba(229,229,231,0.6)] rounded-lg hover:text-[#E5E5E7] transition-colors"
        >
          Plausible ↗
        </a>
      </div>
    </div>
  );
}

function SetupStep({ step, label, code }: { step: number; label: string; code: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full bg-[#1F1F23] mono text-[10px] text-[rgba(229,229,231,0.4)] flex items-center justify-center shrink-0 mt-0.5">
        {step}
      </span>
      <div>
        <div className="mono text-[10px] uppercase tracking-[0.1em] text-[rgba(229,229,231,0.5)] mb-0.5">
          {label}
        </div>
        <code className="mono text-[11px] text-[#FF6B2B] bg-[#1F1F23] px-2 py-0.5 rounded">
          {code}
        </code>
      </div>
    </div>
  );
}

// ── Funnels placeholder ───────────────────────────────────────────────────────

function Funnels() {
  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl p-5">
      <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-3">
        Conversion Funnels
      </div>
      <div className="space-y-3">
        {/* Placeholder funnel bars */}
        {[
          { label: 'Site visit', pct: 100 },
          { label: 'Demo request', pct: 18 },
          { label: 'Discovery call', pct: 9 },
          { label: 'Proposal sent', pct: 4 },
          { label: 'Closed', pct: 1 },
        ].map(({ label, pct }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-28 mono text-[10px] text-[rgba(229,229,231,0.4)] text-right shrink-0">
              {label}
            </div>
            <div className="flex-1 h-2 bg-[#1F1F23] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: pct > 50 ? '#22C55E' : pct > 10 ? '#F59E0B' : '#FF6B2B',
                  opacity: 0.4,
                }}
              />
            </div>
            <div className="w-10 mono text-[10px] text-[rgba(229,229,231,0.3)] tabular-nums">
              {pct}%
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 mono text-[10px] text-[rgba(229,229,231,0.25)]">
        Placeholder data. Connect PostHog to replace with real funnel metrics.
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Analytics() {
  return (
    <div className="space-y-5">
      <AnalyticsConnect />
      <Funnels />
      <SocialReach />
    </div>
  );
}
