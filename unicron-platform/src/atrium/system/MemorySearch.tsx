// MemorySearch.tsx — S5c
// Semantic search over the unicron-knowledge vault. POSTs the query to
// /api/atrium/vault-search; the server embeds the query and runs the
// ns_vault_search_by_vector RPC. Results show path + similarity + snippet.

import { useState, type FormEvent } from 'react';

interface SearchResult {
  id: string;
  path: string;
  content: string;
  similarity: number;
}

export default function MemorySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/vault-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), limit: 10 }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setResults([]);
        return;
      }
      setResults((body.results ?? []) as SearchResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="bg-bg-card border border-border-default rounded-xl px-5 py-4">
        <label className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted block mb-2">
          Search the vault
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. how does the decay tick work"
            className="flex-1 bg-transparent border border-border-default rounded-lg px-3 py-2 mono text-[12px] text-text-primary placeholder-text-muted focus:outline-none focus:border-[#6081BE]"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="border border-border-default rounded-lg px-4 py-2 mono text-[11px] text-text-primary hover:border-[#6081BE] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <p className="mono text-[10px] text-text-muted mt-2">
          Backed by <code>nervous_system.vault_embeddings</code> +{' '}
          <code>ns_vault_search_by_vector</code> (pgvector cosine). The
          nightly <code>vault-embeddings-rebuild-cron</code> keeps the index
          fresh.
        </p>
      </form>

      {error && (
        <div className="bg-bg-card border border-red-500/40 rounded-xl px-5 py-4 mono text-[11px] text-text-secondary">
          <div className="text-red-400 mb-1">Search error</div>
          {error}
          {error.toLowerCase().includes('openai') && (
            <div className="mt-2 text-text-muted">
              If this is a fresh deploy, fire <code>vault/embeddings.rebuild</code>{' '}
              via Inngest once to populate the index, or check that{' '}
              <code>OPENAI_API_KEY</code> is set on this Vercel project.
            </div>
          )}
        </div>
      )}

      {results !== null && results.length === 0 && !error && (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4 mono text-[11px] text-text-muted">
          No matches. Either the query is too specific or the embeddings
          table has not been populated yet (fire <code>vault/embeddings.rebuild</code>).
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2.5">
          {results.map((r) => (
            <div
              key={r.id}
              className="bg-bg-card border border-border-default rounded-xl px-5 py-3"
            >
              <div className="flex items-baseline justify-between mb-1">
                <div className="mono text-[11px] text-text-primary font-medium truncate">
                  {r.path}
                </div>
                <div className="mono text-[10px] text-text-muted shrink-0 ml-3">
                  {(r.similarity * 100).toFixed(1)}%
                </div>
              </div>
              <pre className="mono text-[10px] text-text-secondary leading-relaxed whitespace-pre-wrap line-clamp-4">
                {r.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
