// TaboosViewer.tsx — Sprint 3 Stream D
// Renders taboos.md from the unicron-knowledge vault via the server-side proxy.
// Intentionally read-only — edits require a PR against the vault with peer review.

import { useEffect, useState } from 'react';

export default function TaboosViewer() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/atrium/taboos')
      .then(async (r) => {
        const data = (await r.json()) as { content?: string; error?: string };
        if (data.content !== undefined) {
          setContent(data.content);
        } else {
          setError(data.error ?? 'Failed to load taboos');
        }
      })
      .catch(() => setError('Failed to reach /api/atrium/taboos'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-5 bg-bg-card rounded-lg animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#E14B4B]">{error}</div>
        <div className="mono text-[10px] text-text-muted mt-1">
          Ensure GITHUB_VAULT_TOKEN is set in Vercel environment variables.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-bg-card rounded-xl p-6 border border-border-default">
        <pre className="mono text-[12px] text-[var(--text-hi)] whitespace-pre-wrap leading-relaxed">
          {content}
        </pre>
      </div>
      <div className="mt-4 px-4 py-3 bg-[#C28A1F]/10 border border-[#C28A1F]/20 rounded-xl">
        <p className="mono text-[11px] text-[#C28A1F]">
          Taboos are human-edited only. To propose an edit, open a PR against{' '}
          <span className="text-text-secondary">
            unicron-knowledge/wiki/memory/taboos.md
          </span>{' '}
          with peer review. No agent may modify this file directly.
        </p>
      </div>
    </div>
  );
}
