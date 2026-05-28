'use client';

export function RunButton({
  onClick,
  disabled,
  pending,
}: {
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-busy={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {pending && (
          <svg
            className="h-4 w-4 animate-spin text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
            />
          </svg>
        )}
        {pending ? 'Running…' : 'Run Zedcor — Houston'}
      </button>
      <p className="text-xs text-neutral-500">
        Polls 10 Tier 1 sources, runs phase mapper + ranker + verifier, writes to Notion.
      </p>
    </div>
  );
}
