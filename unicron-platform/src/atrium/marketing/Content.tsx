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
  'social-post': '#FF6B2B',
  content:       '#3B82F6',
  article:       '#0EA5E9',
  post:          '#F59E0B',
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
          <div key={i} className="h-10 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!vaultMounted) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-6 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-2">
          Vault not mounted
        </div>
        <div className="mono text-[12px] text-[rgba(229,229,231,0.3)] mb-3 max-w-sm mx-auto">
          {hint ?? 'The unicron-knowledge vault is not accessible on this server.'}
        </div>
        <div className="mono text-[10px] text-[rgba(229,229,231,0.2)]">
          Set <span className="text-[#FF6B2B]">VAULT_WIKI_DIR</span> env var to enable vault content.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
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
                  background: filter === t ? '#FF6B2B22' : '#1F1F23',
                  color: filter === t ? '#FF6B2B' : 'rgba(229,229,231,0.4)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.4)] hover:text-[#E5E5E7] transition-colors"
        >
          Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-10 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            No content pieces found
          </div>
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
            Add markdown files with <span className="text-[#FF6B2B]">type: blog</span>{' '}
            or <span className="text-[#FF6B2B]">type: content</span> frontmatter to{' '}
            <span className="text-[rgba(229,229,231,0.5)]">unicron-knowledge/wiki/</span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1F1F23]">
          <table className="w-full min-w-[660px]">
            <thead>
              <tr className="bg-[#141416] border-b border-[#1F1F23]">
                {['Title', 'Type', 'Published', 'Channel', 'Traction', 'Tags'].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] text-left whitespace-nowrap"
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
                  className="border-b border-[#1F1F23] hover:bg-[#1A1A1D] transition-colors"
                >
                  <td className="px-4 py-3 mono text-[12px] text-[#E5E5E7] font-medium max-w-[200px] truncate">
                    {item.title}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-[rgba(229,229,231,0.5)] whitespace-nowrap">
                    {formatDate(item.publishedDate)}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-[rgba(229,229,231,0.5)]">
                    {item.channel ?? '—'}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] text-[rgba(229,229,231,0.5)]">
                    {item.traction ?? (
                      <span className="text-[rgba(229,229,231,0.2)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.tags.length > 0
                        ? item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="mono text-[9px] px-1.5 py-0.5 rounded bg-[#1F1F23] text-[rgba(229,229,231,0.5)] uppercase tracking-[0.06em]"
                            >
                              {tag}
                            </span>
                          ))
                        : <span className="mono text-[11px] text-[rgba(229,229,231,0.2)]">—</span>
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
