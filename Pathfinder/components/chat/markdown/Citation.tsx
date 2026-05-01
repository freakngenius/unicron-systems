'use client';

import * as React from 'react';

// Compact superscript citation chip. The chat route's `sources` payload
// already carries the full URL+title list; this component just provides the
// visual handle inline. Hover preview is a CSS-only tooltip (no headlessui
// needed for a static text balloon).
//
// Pathfinder agents historically embed citations as `[1]`, `[2]` markers
// inline. The renderer detects the `[N]` pattern in plain text and replaces
// it with a CitationChip — see MarkdownRenderer for the wiring.

export type CitationData = {
  index: number;
  title?: string;
  url?: string;
};

export function CitationChip({ data }: { data: CitationData }) {
  const { index, title, url } = data;
  const label = title ?? url ?? `Source ${index}`;
  return (
    <a
      href={url ?? '#'}
      target={url ? '_blank' : undefined}
      rel={url ? 'noopener noreferrer' : undefined}
      title={label}
      data-testid="citation-chip"
      className="group relative ml-0.5 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-hi/15 px-[3px] align-super text-[9.5px] font-mono leading-none text-[#0e7490] ring-1 ring-hi/40 hover:bg-hi/25"
    >
      {index}
      {(title || url) && (
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-max max-w-[280px] -translate-x-1/2 rounded-md border border-rule/20 bg-bg px-2 py-1 text-[11px] text-inkSub shadow-md group-hover:block">
          {title ?? url}
        </span>
      )}
    </a>
  );
}
