// app/(authenticated)/internal/zedcor/run/page.tsx
// Sprint Z1B — Zedcor Houston Tier 1 manual trigger page.
//
// Operator-gated by app/(authenticated)/layout.tsx. URL after basePath:
// /pathfinder/internal/zedcor/run (and via the unicron-systems edge rewrite,
// also reachable at internal.unicron.systems/zedcor/run).

import { RunPanel } from './components/RunPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Pathfinder · Zedcor Houston · Run' };

export default function ZedcorRunPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Pathfinder · Operator · Zedcor
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
            Houston Tier 1 — Manual Run
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Trigger Tier 1 source polling for the Zedcor Houston hub, manage scheduled
            operation, and send the daily digest.
          </p>
        </header>
        <RunPanel />
      </div>
    </main>
  );
}
