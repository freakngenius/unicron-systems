// Library.tsx — Pass 2 (R8): cut header stat strip (no vault-stats backend).
//
// SLOT MATRIX (Pass 2 R8):
//  - Docs count · status: CUT · no vault-counting job writes a queryable
//    table; ns_library_stats RPC does not exist.
//  - Fresh % (≤30d modified) · status: CUT · same.
//  - Templates count · status: CUT · same.
//  - Embeddings coverage % · status: CUT · no embedding-pipeline tracker.
//  - Sub-tabs Wiki / Repo / Templates · status: KEPT (real) · LibraryWiki
//    + LibraryRepo + LibraryTemplates all query vault files via existing
//    wiki API endpoints (Sprint 6 Stream C).
//
// Header strip replaced with the page title only. When a vault-stats job
// + ns_library_stats RPC ship, the 4 tiles return.

import { useState } from 'react';
import { LibraryWiki } from './LibraryWiki';
import { LibraryRepo } from './LibraryRepo';
import { LibraryTemplates } from './LibraryTemplates';

const LIBRARY_TABS = [
  { id: 'wiki',      label: 'Wiki' },
  { id: 'repo',      label: 'Repo' },
  { id: 'templates', label: 'Templates' },
] as const;

type LibraryTab = (typeof LIBRARY_TABS)[number]['id'];

export function Library() {
  const [active, setActive] = useState<LibraryTab>('wiki');
  const [wikiSlug, setWikiSlug] = useState<string | undefined>(undefined);

  const navigateToWiki = (slug: string) => {
    setWikiSlug(slug);
    setActive('wiki');
  };

  const navigateToRepo = (slug?: string) => {
    void slug;
    setActive('repo');
  };

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3">
        <div className="text-[11.5px] text-text-muted mb-1.5">Wiki, repo, templates</div>
        <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
          Library
        </h1>
      </div>

      <div className="flex gap-1 px-7 border-b border-border-default overflow-x-auto">
        {LIBRARY_TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3.5 py-3 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive ? 'border-[#6081BE] text-[#6081BE]' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-7 py-5">
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
