// Library.tsx — Sprint 6 Stream C
// Atrium Library tab root. Sub-navigation: Wiki | Repo | Templates.
// Follows the same pattern as Work.tsx and Money.tsx.

import { useState } from 'react';
import { LibraryWiki } from './LibraryWiki';
import { LibraryRepo } from './LibraryRepo';
import { LibraryTemplates } from './LibraryTemplates';

// ── Constants ─────────────────────────────────────────────────────────────────

const LIBRARY_TABS = ['wiki', 'repo', 'templates'] as const;
type LibraryTab = (typeof LIBRARY_TABS)[number];

const LIBRARY_TAB_LABELS: Record<LibraryTab, string> = {
  wiki: 'Wiki',
  repo: 'Repo',
  templates: 'Templates',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Library() {
  const [active, setActive] = useState<LibraryTab>('wiki');
  // Wiki slug navigated from Repo view (allows cross-view deep linking)
  const [wikiSlug, setWikiSlug] = useState<string | undefined>(undefined);

  const navigateToWiki = (slug: string) => {
    setWikiSlug(slug);
    setActive('wiki');
  };

  const navigateToRepo = (slug?: string) => {
    void slug; // slug is informational; Repo always loads recent on open
    setActive('repo');
  };

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-text-primary font-semibold">Library</h1>
        <p className="mono text-[11px] text-text-secondary mt-1">
          Wiki pages, vault search, and document templates — all in one surface.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav
        className="flex gap-0.5 border-b border-border-default mb-6 overflow-x-auto"
        aria-label="Library sub-tabs"
        role="tablist"
      >
        {LIBRARY_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`library-panel-${tab}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? '#7355E5' : 'var(--text-lo)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              {LIBRARY_TAB_LABELS[tab]}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: '#7355E5' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <div>
        {active === 'wiki' && (
          <LibraryWiki key={wikiSlug ?? 'default'} initialSlug={wikiSlug} />
        )}
        {active === 'repo' && (
          <LibraryRepo onNavigateToWiki={navigateToWiki} />
        )}
        {active === 'templates' && (
          <LibraryTemplates onNavigateToRepo={navigateToRepo} />
        )}
      </div>
    </div>
  );
}
