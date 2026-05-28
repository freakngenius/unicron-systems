'use client';

export function RunButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {disabled ? 'Running…' : 'Run Zedcor — Houston'}
      </button>
      <p className="text-xs text-neutral-500">
        Polls 10 Tier 1 sources, runs phase mapper + ranker + verifier, writes to Notion.
      </p>
    </div>
  );
}
