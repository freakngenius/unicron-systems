// SkillsListEmpty — shared empty / error / loading states for the Library
// Skills surface and Now-tab recommendations. Keeps the three modes visually
// distinct so the operator never confuses a transient fetch with a real
// zero-result list.

interface Props {
  mode: 'loading' | 'empty' | 'error';
  /** Optional override for the headline (e.g. "No matches in this tenant"). */
  message?: string;
  /** Optional contextual hint shown beneath the headline. */
  hint?: string;
}

export function SkillsListEmpty({ mode, message, hint }: Props) {
  if (mode === 'loading') {
    return (
      <div
        data-testid="skills-list-empty-loading"
        role="status"
        aria-label="Loading Skills…"
        className="space-y-2"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 bg-border-default animate-pulse rounded-xl"
          />
        ))}
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div
        data-testid="skills-list-empty-error"
        role="alert"
        className="bg-bg-card border border-[rgba(225,75,75,0.30)] rounded-xl px-4 py-5 text-center"
      >
        <p className="mono text-[12px] font-semibold text-[#B23636]">
          {message ?? 'Could not load Skills.'}
        </p>
        {hint && (
          <p className="mono text-[10.5px] text-text-secondary mt-1.5">
            {hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="skills-list-empty-empty"
      className="bg-bg-card border border-border-default rounded-xl px-4 py-6 text-center"
    >
      <p className="mono text-[12px] font-medium text-text-primary">
        {message ?? 'No Skills match the current filter.'}
      </p>
      <p className="mono text-[10.5px] text-text-secondary mt-1.5">
        {hint ?? 'Try widening the lifecycle filter or switching scope.'}
      </p>
    </div>
  );
}
