// Content.tsx — Sprint 6 Stream A
// Lists content pieces from the unicron-knowledge vault wiki.
// Fetches from GET /api/atrium/content which reads vault markdown files.

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentItem {
  filename: string;
  relativePath: string;
  title: string;
  type: string;
  publishedDate: string | null;
  channel: string | null;
  traction: string | null;
  tags: string[];
}

interface ContentResponse {
  items: ContentItem[];
  vaultMounted: boolean;
  hint?: string;
  error?: string;
}

// ── Design helpers ────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  blog:          '#7C3AED',
  'social-post': 'var(--accent)',
  content:       '#6F95D6',
  article:       '#0EA5E9',
  post:          '#D9A23A',
};

function typeColor(t: string) {
  return TYPE_COLOR[t] ?? '#6B7280';
}

function TypeBadge({ type }: { type: string }) {
  const color = typeColor(type);
  return (
    <span
      className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: color + '22', color }}
    >
      {type}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  } catch {
    return d;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Content() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [vaultMounted, setVaultMounted] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/content');
      const json = (await res.json()) as ContentResponse;
      if (!res.ok) throw new Error(json.error ?? 'Failed to load content');
      setItems(json.items ?? []);
      setVaultMounted(json.vaultMounted ?? false);
      setHint(json.hint ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Derive unique types for filter
  const types = ['all', ...Array.from(new Set(items.map((i) => i.type))).sort()];

  const filtered = filter === 'all' ? items : items.filter((i) => i.type === filter);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#DD6262]/10 border border-[#DD6262]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#DD6262]">{error}</div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!vaultMounted) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-6 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-2">
          Vault not mounted
        </div>
        <div className="mono text-[12px] text-text-muted mb-3 max-w-sm mx-auto">
          {hint ?? 'The unicron-knowledge vault is not accessible on this server.'}
        </div>
        <div className="mono text-[10px] text-text-faint">
          Set <span className="text-accent-orange">VAULT_WIKI_DIR</span> env var to enable vault content.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] text-text-secondary">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
          {/* Type filter */}
          <div className="flex gap-1 ml-2">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded transition-colors"
                style={{
                  background: filter === t ? `rgba(232,118,58,0.13)` : 'var(--border-default)',
                  color: filter === t ? 'var(--accent)' : 'var(--text-lo)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-10 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
            No content pieces found
          </div>
          <div className="mono text-[11px] text-text-muted">
            Add markdown files with <span className="text-accent-orange">type: blog</span>{' '}
            or <span className="text-accent-orange">type: content</span> frontmatter to{' '}
            <span className="text-text-secondary">unicron-knowledge/wiki/</span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full min-w-[660px]">
            <thead>
              <tr className="bg-bg-card border-b border-border-default">
                {['Title', 'Type', 'Published', 'Channel', 'Traction', 'Tags'].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-text-muted text-left whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.relativePath}
                  className="border-b border-border-default hover:bg-bg-raised transition-colors"
                >
                  <td className="px-4 py-3 mono text-[12px] text-text-primary font-medium max-w-[200px] truncate">
                    {item.title}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary whitespace-nowrap">
                    {formatDate(item.publishedDate)}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary">
                    {item.channel ?? '—'}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-text-secondary">
                    {item.traction ?? (
                      <span className="text-text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.tags.length > 0
                        ? item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="mono text-[9px] px-1.5 py-0.5 rounded bg-bg-raised text-text-secondary uppercase tracking-[0.06em]"
                            >
                              {tag}
                            </span>
                          ))
                        : <span className="mono text-[11px] text-text-faint">—</span>
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
