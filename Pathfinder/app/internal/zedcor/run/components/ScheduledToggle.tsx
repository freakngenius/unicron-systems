'use client';

import { useState } from 'react';

export function ScheduledToggle({
  enabled,
  onChange,
  hydrated,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  hydrated: boolean;
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Scheduled operation</h2>
          <button
            type="button"
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
            onFocus={() => setTooltipOpen(true)}
            onBlur={() => setTooltipOpen(false)}
            aria-label="What does the scheduled toggle do?"
            className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-[10px] font-semibold text-neutral-500 hover:border-neutral-500 hover:text-neutral-700"
          >
            i
            {tooltipOpen && (
              <span className="absolute left-6 top-1/2 z-10 w-72 -translate-y-1/2 rounded border border-neutral-200 bg-white p-3 text-left text-[11px] font-normal leading-snug text-neutral-700 shadow-md">
                Two-layer disable. Layer 1 lives in <code className="font-mono">vercel.json</code>{' '}
                cron entries. Layer 2 is a per-handler guard reading{' '}
                <code className="font-mono">organizations.config-&gt;&gt;&apos;manual_only&apos;</code>.
                This toggle flips Layer 2 only. To fully resume cron, both layers must be live.
              </span>
            )}
          </button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!hydrated}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            enabled ? 'bg-emerald-500' : 'bg-neutral-300'
          } disabled:opacity-50`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        When <strong>ON</strong>, scheduled crons fire for Zedcor in addition to manual triggers.
        When <strong>OFF</strong>, only manual triggers run.
      </p>
    </div>
  );
}
