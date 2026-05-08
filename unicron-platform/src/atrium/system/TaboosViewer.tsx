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
          <div key={i} className="h-5 bg-[#141416] rounded-lg animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
        <div className="mono text-[10px] text-[rgba(229,229,231,0.4)] mt-1">
          Ensure GITHUB_VAULT_TOKEN is set in Vercel environment variables.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-[#141416] rounded-xl p-6 border border-[#1F1F23]">
        <pre className="mono text-[12px] text-[rgba(229,229,231,0.85)] whitespace-pre-wrap leading-relaxed">
          {content}
        </pre>
      </div>
      <div className="mt-4 px-4 py-3 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-xl">
        <p className="mono text-[11px] text-[#F59E0B]">
          Taboos are human-edited only. To propose an edit, open a PR against{' '}
          <span className="text-[rgba(229,229,231,0.7)]">
            unicron-knowledge/wiki/memory/taboos.md
          </span>{' '}
          with peer review. No agent may modify this file directly.
        </p>
      </div>
    </div>
  );
}
