// Library.tsx — S4b restores vault-stats header tiles backed by
// nervous_system.vault_stats + ns_vault_stats_latest RPC. The hourly cron
// `vault-stats-cron` populates the table; the tiles degrade to "—" until
// the first row lands.

import { useState, useEffect } from 'react';
import { LibraryWiki } from './LibraryWiki';
import { LibraryRepo } from './LibraryRepo';
import { LibraryTemplates } from './LibraryTemplates';
import { getSupabase } from '../lib/supabase';

const LIBRARY_TABS = [
  { id: 'wiki',      label: 'Wiki' },
  { id: 'repo',      label: 'Repo' },
  { id: 'templates', label: 'Templates' },
] as const;

type LibraryTab = (typeof LIBRARY_TABS)[number]['id'];

interface VaultStats {
  observed_at: string;
  raw_docs: number;
  wiki_docs: number;
  outputs_docs: number;
  total_bytes: number;
  last_commit_sha: string | null;
  last_commit_at: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)}${sizes[i]}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function VaultStatsStrip() {
  const [stats, setStats] = useState<VaultStats | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    sb.rpc('ns_vault_stats_latest').then(({ data }) => {
      if (cancelled) return;
      const row = Array.isArray(data) && data.length > 0 ? (data[0] as VaultStats) : null;
      setStats(row);
    });
    return () => { cancelled = true; };
  }, []);

  const tiles = [
    { label: 'raw/', value: stats?.raw_docs ?? null },
    { label: 'wiki/', value: stats?.wiki_docs ?? null },
    { label: 'outputs/', value: stats?.outputs_docs ?? null },
    { label: 'size', value: stats ? formatBytes(stats.total_bytes) : null },
    { label: 'last commit', value: stats ? timeAgo(stats.last_commit_at) : null },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="bg-bg-card border border-border-default rounded-lg px-3 py-2.5"
        >
          <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted mb-0.5">
            {t.label}
          </div>
          <div className="mono text-[16px] text-text-primary font-medium leading-none">
            {t.value ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

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
        <VaultStatsStrip />
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
