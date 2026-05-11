// Library.tsx — v3 redesign Pass 1 (R8 of Atrium Total Tab Rewrite)
// v3-library.jsx IA: Geist display title, 4-stat header strip
// (docs / fresh % / templates / embeddings %), v3 blue underline sub-tabs.
// Sub-tab content (LibraryWiki, LibraryRepo, LibraryTemplates) preserved.
// Wiki sidebar + On-this-page TOC are inside LibraryWiki (Pass 2 work).

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { LibraryWiki } from './LibraryWiki';
import { LibraryRepo } from './LibraryRepo';
import { LibraryTemplates } from './LibraryTemplates';

const LIBRARY_TABS = [
  { id: 'wiki',      label: 'Wiki' },
  { id: 'repo',      label: 'Repo' },
  { id: 'templates', label: 'Templates' },
] as const;

type LibraryTab = (typeof LIBRARY_TABS)[number]['id'];

interface LibraryStats {
  docs: number | null;
  freshPct: number | null;
  templates: number | null;
  embedCoveragePct: number | null;
}

function useLibraryStats(): LibraryStats {
  const [s, setS] = useState<LibraryStats>({
    docs: null, freshPct: null, templates: null, embedCoveragePct: null,
  });
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_library_stats')
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as Array<{ doc_count: number; fresh_pct: number; template_count: number; embed_coverage_pct: number }> | null)?.[0];
        if (row) {
          setS({
            docs: row.doc_count,
            freshPct: row.fresh_pct,
            templates: row.template_count,
            embedCoveragePct: row.embed_coverage_pct,
          });
        }
      })
      .catch(() => {/* RPC may not exist yet */});
    return () => { cancelled = true; };
  }, []);
  return s;
}

function StatTile({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[22px] font-semibold leading-none" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, color: accent ?? '#0B1530' }}>
        {value}
      </div>
      <div className="text-[11px] text-text-muted uppercase tracking-[0.12em] font-semibold">{label}</div>
    </div>
  );
}

export function Library() {
  const [active, setActive] = useState<LibraryTab>('wiki');
  const [wikiSlug, setWikiSlug] = useState<string | undefined>(undefined);
  const stats = useLibraryStats();

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
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Wiki, repo, templates</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            Library
          </h1>
        </div>
        {/* Header stats strip — 4 tiles per v3 */}
        <div className="flex items-end gap-7 pb-1">
          <StatTile value={stats.docs === null ? '—' : stats.docs.toLocaleString()} label="docs" />
          <StatTile value={stats.freshPct === null ? '—' : `${stats.freshPct}%`} label="fresh" accent="#2E8E66" />
          <StatTile value={stats.templates === null ? '—' : String(stats.templates)} label="templates" />
          <StatTile value={stats.embedCoveragePct === null ? '—' : `${stats.embedCoveragePct}%`} label="embeddings" accent="#6081BE" />
        </div>
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
