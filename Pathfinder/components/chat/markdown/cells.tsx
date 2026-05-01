'use client';

import * as React from 'react';
import {
  type CellKind,
  formatCurrency,
  parseScore,
  scoreToneFor,
  splitDistance,
  stageToneFor,
} from './cellHeuristics';

// All cells render plain text by default. Specialized cells own their own
// alignment + typography. The wrapper <td> in MarkdownRenderer owns the
// border / padding shell so the cell components stay compact.

const EMPTY = '—';

function isEmpty(s: string): boolean {
  const t = s.trim();
  return !t || t === '-' || t === '—' || t.toLowerCase() === 'n/a';
}

export function MutedDash() {
  return <span className="text-inkFaint">{EMPTY}</span>;
}

// ── Score pill ────────────────────────────────────────────────────────────

const SCORE_TONE_CLASS: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-warm/15 text-[#4d7c0f] ring-1 ring-warm/40',
  amber: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

export function ScoreCell({ raw }: { raw: string }) {
  if (isEmpty(raw)) return <MutedDash />;
  const n = parseScore(raw);
  if (n === null) return <span>{raw}</span>;
  const tone = scoreToneFor(n);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-[1px] font-mono text-[11px] tabular-nums ${SCORE_TONE_CLASS[tone]}`}
      data-testid="cell-score"
      data-tone={tone}
    >
      {n}
    </span>
  );
}

// ── Currency ─────────────────────────────────────────────────────────────

export function CurrencyCell({ raw }: { raw: string }) {
  if (isEmpty(raw)) return <MutedDash />;
  const formatted = formatCurrency(raw);
  return (
    <span className="font-mono tabular-nums" data-testid="cell-currency">
      {formatted}
    </span>
  );
}

// ── Stage badge ──────────────────────────────────────────────────────────

const STAGE_TONE_CLASS: Record<'neutral' | 'progress' | 'won' | 'soft', string> = {
  neutral: 'bg-bgAlt text-inkSub ring-1 ring-inkFaint/30',
  progress: 'bg-hi/10 text-[#0e7490] ring-1 ring-hi/40',
  won: 'bg-warm/20 text-[#4d7c0f] ring-1 ring-warm/50',
  soft: 'bg-bgAlt text-inkDim ring-1 ring-inkFaint/30',
};

export function StageCell({ raw }: { raw: string }) {
  if (isEmpty(raw)) return <MutedDash />;
  const tone = stageToneFor(raw);
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-[1px] font-mono text-[10.5px] uppercase tracking-wider ${STAGE_TONE_CLASS[tone]}`}
      data-testid="cell-stage"
      data-tone={tone}
    >
      {raw.trim()}
    </span>
  );
}

// ── Distance ─────────────────────────────────────────────────────────────

export function DistanceCell({ raw }: { raw: string }) {
  if (isEmpty(raw)) return <MutedDash />;
  const { value, unit } = splitDistance(raw);
  if (value === EMPTY) return <MutedDash />;
  return (
    <span className="font-mono tabular-nums" data-testid="cell-distance">
      {value}
      {unit && <span className="ml-0.5 text-inkFaint">{unit}</span>}
    </span>
  );
}

// ── ID cell (mono, truncated, click-to-copy) ─────────────────────────────

export function IdCell({ raw }: { raw: string }) {
  const value = raw.trim().replace(/^`|`$/g, '');
  const onClick = React.useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
  }, [value]);
  if (isEmpty(raw)) return <MutedDash />;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${value} · click to copy`}
      data-testid="cell-id"
      className="font-mono text-[11px] text-inkSub hover:text-ink hover:underline truncate inline-block max-w-[10rem] align-middle"
    >
      {value}
    </button>
  );
}

// ── Title cell (link if /projects/<id> would route) ──────────────────────
//
// react-markdown gives us the rendered children directly — we accept them
// as `children` so embedded markdown formatting (italic, bold, links) is
// preserved. The optional `idHint` is the project id from the same row,
// derived by the renderer; when present the title links to /projects/<id>.

export function TitleCell({
  children,
  idHint,
}: {
  children: React.ReactNode;
  idHint?: string;
}) {
  if (idHint) {
    return (
      <a
        href={`/projects/${encodeURIComponent(idHint)}`}
        className="text-ink hover:underline"
        data-testid="cell-title"
      >
        {children}
      </a>
    );
  }
  return (
    <span className="text-ink" data-testid="cell-title">
      {children}
    </span>
  );
}

// ── Plain ────────────────────────────────────────────────────────────────

export function PlainCell({
  raw,
  children,
}: {
  raw: string;
  children: React.ReactNode;
}) {
  if (isEmpty(raw)) return <MutedDash />;
  return <span data-testid="cell-plain">{children}</span>;
}

// ── Wrapper that picks the right cell by kind ────────────────────────────

export function CellByKind({
  kind,
  raw,
  children,
  idHint,
}: {
  kind: CellKind;
  raw: string;
  children: React.ReactNode;
  idHint?: string;
}) {
  switch (kind) {
    case 'score':
      return <ScoreCell raw={raw} />;
    case 'currency':
      return <CurrencyCell raw={raw} />;
    case 'stage':
      return <StageCell raw={raw} />;
    case 'distance':
      return <DistanceCell raw={raw} />;
    case 'id':
      return <IdCell raw={raw} />;
    case 'title':
      return <TitleCell idHint={idHint}>{children}</TitleCell>;
    default:
      return <PlainCell raw={raw}>{children}</PlainCell>;
  }
}

export const ALIGNMENT_BY_KIND: Record<CellKind, 'left' | 'right' | 'center'> = {
  score: 'center',
  currency: 'right',
  stage: 'center',
  distance: 'right',
  id: 'left',
  title: 'left',
  plain: 'left',
};
