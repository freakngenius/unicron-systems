// LibraryRepo.tsx — Sprint 6 Stream C
// Atrium Library > Repo sub-view.
//
// Full-text + tag search across the vault wiki.
// Recent docs shown by default (mtime desc). "My recent" = last 10 by mtime.

import { useState, useEffect, useRef } from 'react';
import type { SearchResult } from './library/useWikiApi';
import { searchVault } from './library/useWikiApi';

// ── Known tag palette (discoverable from search results) ─────────────────────

const DEFAULT_TAGS = ['prd', 'spec', 'prompt', 'retro', 'decision', 'taboo', 'memory', 'company'];

// ── Component ─────────────────────────────────────────────────────────────────

export function LibraryRepo({ onNavigateToWiki }: { onNavigateToWiki?: (slug: string) => void }) {
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myRecent, setMyRecent] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (q: string, tags: string[]) => {
    setLoading(true);
    setError(null);
    searchVault(q, tags)
      .then((res) => {
        setResults(res);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  };

  // Load recent docs on mount
  useEffect(() => {
    runSearch('', []);
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(q, activeTags);
    }, 350);
  };

  const toggleTag = (tag: string) => {
    const next = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    setActiveTags(next);
    runSearch(query, next);
  };

  const displayedResults = myRecent ? results.slice(0, 10) : results;

  return (
    <div className="max-w-3xl">
      {/* Search bar */}
      <div className="relative mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search vault…"
          className="w-full bg-bg-raised border border-border-default rounded px-4 py-2.5 mono text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 mono text-[10px] text-text-secondary animate-pulse">
            …
          </div>
        )}
      </div>

      {/* Tag filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {DEFAULT_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={[
              'mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded-full border transition-colors',
              activeTags.includes(tag)
                ? 'border-[#E8763A] text-[#E8763A] bg-[rgba(232,118,58,0.08)]'
                : 'border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary',
            ].join(' ')}
          >
            {tag}
          </button>
        ))}
        <button
          onClick={() => {
            setMyRecent((v) => !v);
          }}
          className={[
            'mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded-full border transition-colors ml-auto',
            myRecent
              ? 'border-[#E8763A] text-[#E8763A] bg-[rgba(232,118,58,0.06)]'
              : 'border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary',
          ].join(' ')}
        >
          My Recent
        </button>
      </div>

      {/* Results header */}
      <div className="mono text-[10px] text-text-secondary mb-3">
        {loading
          ? 'Searching…'
          : error
            ? `Error: ${error}`
            : `${displayedResults.length} result${displayedResults.length !== 1 ? 's' : ''}${query ? ` for "${query}"` : ' (recent)'}`}
      </div>

      {/* Results list */}
      {!loading && !error && (
        <div className="flex flex-col gap-2">
          {displayedResults.length === 0 ? (
            <div className="mono text-[11px] text-text-secondary py-8 text-center">
              No results found.
            </div>
          ) : (
            displayedResults.map((result) => (
              <div
                key={result.slug}
                className="border border-border-default rounded-lg p-4 hover:border-border-strong transition-colors cursor-pointer"
                onClick={() => onNavigateToWiki?.(result.slug)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onNavigateToWiki?.(result.slug);
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="mono text-[12px] text-text-primary font-medium truncate">
                    {result.title}
                  </div>
                  {result.created_at && (
                    <div className="mono text-[9px] text-text-secondary shrink-0">
                      {result.created_at.slice(0, 10)}
                    </div>
                  )}
                </div>
                <div className="mono text-[10px] text-text-secondary mb-1 truncate">
                  {result.slug}
                </div>
                {result.excerpt && (
                  <div className="mono text-[10px] text-[rgba(229,229,231,0.5)] line-clamp-2 mb-2">
                    {result.excerpt}
                  </div>
                )}
                {result.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className="mono text-[8px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border border-border-default text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
