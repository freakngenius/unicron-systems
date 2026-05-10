// ui-primitives.tsx — Sprint 7 Stream D
// Shared skeleton, empty-state, and error-state components for all 8 Atrium tabs.
// These components enforce consistent UX patterns across async data surfaces.

import type { ReactNode } from 'react';

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// Use for loading states on cards, list rows, and table rows.

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-zinc-800 rounded ${className ?? ''}`}
      role="status"
      aria-label="Loading…"
    />
  );
}

// ─── SkeletonRows ─────────────────────────────────────────────────────────────
// Convenience: n skeleton rows for list/table loading states.

export function SkeletonRows({
  count = 4,
  height = 'h-10',
}: {
  count?: number;
  height?: string;
}) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading…">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full`} />
      ))}
    </div>
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={`bg-[#141416] border border-[#1F1F23] rounded-xl p-4 space-y-3 ${className ?? ''}`}
      role="status"
      aria-label="Loading…"
    >
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Use when a data surface returns zero records.

export function EmptyState({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-[#141416] border border-[#1F1F23] rounded-xl px-5">
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1">
        {title}
      </p>
      <p className="mono text-[11px] text-zinc-600 mt-1 max-w-sm leading-relaxed">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 mono text-[11px] text-zinc-100 underline underline-offset-2 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded"
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────
// Use when an API call fails. Always include onRetry.

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5">
      <p className="mono text-[12px] text-red-400">Something went wrong</p>
      <p className="mono text-[11px] text-zinc-600 mt-1 max-w-sm leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 mono text-[11px] text-zinc-100 underline underline-offset-2 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded"
        >
          Retry
        </button>
      )}
    </div>
  );
}
