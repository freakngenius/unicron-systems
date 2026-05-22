// ui-primitives.tsx — Sprint 7 Stream D
// Shared skeleton, empty-state, and error-state components for all 8 Atrium tabs.
// These components enforce consistent UX patterns across async data surfaces.

import type { ReactNode } from 'react';

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// Use for loading states on cards, list rows, and table rows.

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-border-default rounded ${className ?? ''}`}
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
      className={`bg-white border border-border-default rounded-xl p-4 space-y-3 ${className ?? ''}`}
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
    <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-border-default rounded-xl px-5">
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1">
        {title}
      </p>
      <p className="mono text-[11px] text-zinc-600 mt-1 max-w-sm leading-relaxed">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 mono text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-border-strong rounded"
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────
// Use when an API call fails. Always include onRetry. `code` surfaces a stable
// identifier (HTTP status, error class) so support can correlate reports.

export function ErrorState({
  message,
  code,
  onRetry,
}: {
  message: string;
  code?: string | number;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-16 text-center bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5"
    >
      <p className="mono text-[12px] text-red-400">Something went wrong</p>
      <p className="mono text-[11px] text-zinc-700 mt-1 max-w-sm leading-relaxed">
        {message}
      </p>
      {code !== undefined && (
        <p className="mono text-[10px] text-zinc-500 mt-1">code: {String(code)}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 mono text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-border-strong rounded"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ─── ErrorBanner ──────────────────────────────────────────────────────────────
// Inline error for embedded contexts where a full-page ErrorState would be
// overkill (e.g. above a table that still rendered cached rows). Verbatim
// message + optional code + retry, matching the CustomersPipeline pattern.

export function ErrorBanner({
  message,
  code,
  onRetry,
}: {
  message: string;
  code?: string | number;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-center justify-between gap-3 rounded-md border border-[#E14B4B]/30 bg-[#E14B4B]/10 px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="mono text-[12px] text-red-400 break-words">{message}</p>
        {code !== undefined && (
          <p className="mono text-[10px] text-zinc-500 mt-0.5">code: {String(code)}</p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mono text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong rounded whitespace-nowrap"
        >
          Retry
        </button>
      )}
    </div>
  );
}
