// PlausibleStats.tsx — S5a
// Fetches /api/atrium/plausible/stats. Renders 4 metric tiles when configured;
// otherwise shows the existing Connect Plausible CTA card.

import { useEffect, useState } from 'react';

interface PlausibleResponse {
  configured: boolean;
  message?: string;
  period?: string;
  results?: {
    visitors?: { value: number };
    visits?: { value: number };
    pageviews?: { value: number };
    bounce_rate?: { value: number };
  };
  error?: string;
}

export default function PlausibleStats() {
  const [state, setState] = useState<PlausibleResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/atrium/plausible/stats?period=30d')
      .then((r) => r.json().then((j) => ({ status: r.status, body: j })))
      .then(({ body }) => { if (!cancelled) setState(body as PlausibleResponse); })
      .catch((err) => { if (!cancelled) setState({ configured: false, error: String(err) }); });
    return () => { cancelled = true; };
  }, []);

  if (state === null) {
    return (
      <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm mono text-[11.5px] text-text-muted">
        Loading Plausible stats…
      </div>
    );
  }

  if (!state.configured) {
    return (
      <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm flex items-start gap-3">
        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#7E8AA3' }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-text-primary font-medium">
            Analytics not connected
          </div>
          <div className="text-[11.5px] text-text-muted mt-0.5">
            Set <code>PLAUSIBLE_API_KEY</code> and <code>PLAUSIBLE_SITE_ID</code> on
            the unicron-platform Vercel project, then redeploy. Stats appear here
            on first request after env vars land.
          </div>
        </div>
        <a
          href="https://plausible.io/settings"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border-default text-text-secondary hover:bg-bg-raised whitespace-nowrap shrink-0"
        >
          Connect Plausible
        </a>
      </div>
    );
  }

  const r = state.results ?? {};
  const tiles = [
    { label: 'Visitors', value: r.visitors?.value },
    { label: 'Visits', value: r.visits?.value },
    { label: 'Pageviews', value: r.pageviews?.value },
    { label: 'Bounce rate', value: r.bounce_rate?.value, suffix: '%' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">{t.label}</div>
          <div className="mono text-[20px] text-text-primary font-medium leading-tight mt-1">
            {typeof t.value === 'number' ? t.value.toLocaleString() : '—'}
            {t.suffix && typeof t.value === 'number' ? t.suffix : ''}
          </div>
          <div className="mono text-[9px] text-text-muted mt-1">last 30d via Plausible</div>
        </div>
      ))}
      {state.error && (
        <div className="col-span-full mono text-[10px] text-text-muted">Plausible error: {state.error}</div>
      )}
    </div>
  );
}
