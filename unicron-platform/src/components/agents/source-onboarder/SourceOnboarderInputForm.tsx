import { useState, type FormEvent } from 'react';
import type { OnboardHint, OnboardRequest } from '../../../lib/contracts/sourceOnboarder';

export interface SourceOnboarderInputFormValues {
  url: string;
  description: string;
  hint: OnboardHint | '';
  jurisdiction: string;
  api_key_env: string;
  test_only: boolean;
}

interface Props {
  disabled?: boolean;
  onSubmit: (values: SourceOnboarderInputFormValues) => void | Promise<void>;
}

const DEFAULTS: SourceOnboarderInputFormValues = {
  url: '',
  description: '',
  hint: '',
  jurisdiction: '',
  api_key_env: '',
  test_only: false,
};

export function SourceOnboarderInputForm({ disabled, onSubmit }: Props) {
  const [values, setValues] = useState<SourceOnboarderInputFormValues>(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof SourceOnboarderInputFormValues>(
    key: K,
    v: SourceOnboarderInputFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled || submitting) return;
    setError(null);

    if (values.url.trim().length === 0 && values.description.trim().length === 0) {
      setError('Supply at least one of URL or description.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  const isDisabled = disabled || submitting;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      data-testid="source-onboarder-input-form"
    >
      <FieldRow label="URL" hint="Either-or with description. The agent prefers URL when both are present.">
        <input
          type="url"
          value={values.url}
          onChange={(e) => update('url', e.target.value)}
          placeholder="https://data.example.gov/permits"
          disabled={isDisabled}
          className={inputClass}
          data-testid="source-onboarder-url"
        />
      </FieldRow>

      <FieldRow label="OR DESCRIPTION">
        <textarea
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          placeholder="Describe a source the agent should hunt down — e.g. 'Sacramento County permits, weekly updates, JSON feed.'"
          disabled={isDisabled}
          className={inputClass}
          data-testid="source-onboarder-description"
        />
      </FieldRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="HINT" hint="Source-type hint. Auto-detect when blank.">
          <select
            value={values.hint}
            onChange={(e) => update('hint', e.target.value as OnboardHint | '')}
            disabled={isDisabled}
            className={inputClass}
            data-testid="source-onboarder-hint"
          >
            <option value="">auto-detect</option>
            <option value="socrata">socrata</option>
            <option value="rest">rest</option>
            <option value="rss">rss</option>
            <option value="json-dump">json-dump</option>
          </select>
        </FieldRow>

        <FieldRow label="JURISDICTION">
          <input
            type="text"
            value={values.jurisdiction}
            onChange={(e) => update('jurisdiction', e.target.value)}
            placeholder="e.g. Allegheny County, PA"
            disabled={isDisabled}
            className={inputClass}
            data-testid="source-onboarder-jurisdiction"
          />
        </FieldRow>
      </div>

      <FieldRow
        label="API KEY ENV (NAME ONLY)"
        hint="Name of an env var holding the API key. The agent will reference it; never paste the key here."
      >
        <input
          type="text"
          value={values.api_key_env}
          onChange={(e) => update('api_key_env', e.target.value)}
          placeholder="e.g. AUSTIN_OPEN_DATA_TOKEN"
          disabled={isDisabled}
          className={inputClass}
          data-testid="source-onboarder-api-key-env"
        />
      </FieldRow>

      <label className="flex items-center gap-2 mono text-[11px] uppercase tracking-[0.18em] text-text-primary/70">
        <input
          type="checkbox"
          checked={values.test_only}
          onChange={(e) => update('test_only', e.target.checked)}
          disabled={isDisabled}
          className="accent-accent-gold"
          data-testid="source-onboarder-test-only"
        />
        TEST ONLY — RUN END-TO-END WITHOUT COMMITTING
      </label>

      {error ? (
        <p
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
          role="alert"
          data-testid="source-onboarder-form-error"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isDisabled}
          data-testid="source-onboarder-dispatch-button"
          className="mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'DISPATCHING…' : 'DISPATCH'}
        </button>
      </div>
    </form>
  );
}

/** Convert form values to the wire `OnboardRequest` shape. */
export function toOnboardRequest(values: SourceOnboarderInputFormValues): OnboardRequest {
  const request: OnboardRequest = {};
  if (values.url.trim()) request.url = values.url.trim();
  if (values.description.trim()) request.description = values.description.trim();
  if (values.hint) request.hint = values.hint;
  if (values.jurisdiction.trim()) request.jurisdiction = values.jurisdiction.trim();
  if (values.api_key_env.trim()) request.api_key_env = values.api_key_env.trim();
  return request;
}

const inputClass =
  'bg-bg-panel border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-accent-gold/60 disabled:opacity-50';

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mono text-[10px] tracking-[0.04em] text-text-primary/30">{hint}</span>
      ) : null}
    </label>
  );
}
