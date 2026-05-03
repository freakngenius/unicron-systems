import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { CoverageScopeConstraints } from '../../../lib/contracts/coverage';

export interface CoverageInputFormValues {
  vertical_id: string;
  goal_text: string;
  metros: string[];
  radius_miles: number;
  target_lead_count: number;
  signal_keywords: string[];
  lookback_days: 14 | 30 | 60 | 90;
  budget_usd: number | null;
}

interface Props {
  disabled?: boolean;
  defaultValues?: Partial<CoverageInputFormValues>;
  onSubmit: (values: CoverageInputFormValues) => void | Promise<void>;
}

const SUGGESTED_KEYWORDS = [
  'construction',
  'security',
  'commercial new',
  'permit',
  'industrial',
  'multifamily',
];

const DEFAULT_VALUES: CoverageInputFormValues = {
  vertical_id: 'pathfinder-default',
  goal_text: '',
  metros: [],
  radius_miles: 25,
  target_lead_count: 50,
  signal_keywords: [],
  lookback_days: 30,
  budget_usd: null,
};

export function CoverageInputForm({ disabled, defaultValues, onSubmit }: Props) {
  const [values, setValues] = useState<CoverageInputFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...defaultValues,
  }));
  const [metroDraft, setMetroDraft] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CoverageInputFormValues>(
    key: K,
    value: CoverageInputFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const addMetro = () => {
    const metro = metroDraft.trim();
    if (metro.length === 0) return;
    if (values.metros.includes(metro)) return;
    update('metros', [...values.metros, metro]);
    setMetroDraft('');
  };

  const removeMetro = (metro: string) =>
    update(
      'metros',
      values.metros.filter((m) => m !== metro),
    );

  const addKeyword = (kw?: string) => {
    const next = (kw ?? keywordDraft).trim();
    if (next.length === 0) return;
    if (values.signal_keywords.includes(next)) return;
    update('signal_keywords', [...values.signal_keywords, next]);
    setKeywordDraft('');
  };

  const removeKeyword = (kw: string) =>
    update(
      'signal_keywords',
      values.signal_keywords.filter((k) => k !== kw),
    );

  const handleChipKeydown = (e: KeyboardEvent<HTMLInputElement>, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      fn();
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled || submitting) return;
    setError(null);

    if (values.goal_text.trim().length < 10) {
      setError('Goal text must describe what you want — at least 10 characters.');
      return;
    }
    if (values.metros.length === 0) {
      setError('Add at least one metro / county.');
      return;
    }
    if (!Number.isFinite(values.target_lead_count) || values.target_lead_count <= 0) {
      setError('Target lead count must be a positive number.');
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
      data-testid="coverage-input-form"
    >
      <FieldRow label="VERTICAL">
        <select
          value={values.vertical_id}
          onChange={(e) => update('vertical_id', e.target.value)}
          disabled={isDisabled}
          className={inputClass}
          data-testid="coverage-vertical"
        >
          <option value="pathfinder-default">pathfinder-default</option>
          <option value="construction-security">construction-security</option>
          <option value="commercial-real-estate">commercial-real-estate</option>
        </select>
      </FieldRow>

      <FieldRow
        label="GOAL"
        hint="What does success look like for this expansion?"
      >
        <textarea
          value={values.goal_text}
          onChange={(e) => update('goal_text', e.target.value)}
          placeholder="e.g. Expand Pittsburgh metro coverage for construction-security signal — target 50 additional qualified leads/week."
          rows={3}
          disabled={isDisabled}
          className={inputClass}
          data-testid="coverage-goal-text"
        />
      </FieldRow>

      <FieldRow label="GEOGRAPHY" hint="Metro, county, or list. Add several for a batch run.">
        <div className="flex flex-wrap items-center gap-2">
          {values.metros.map((m) => (
            <span
              key={m}
              data-testid="coverage-metro-chip"
              className="mono text-[11px] uppercase tracking-[0.18em] border border-border-default rounded-full px-3 py-1 text-text-primary/80 flex items-center gap-2 bg-bg-panel"
            >
              {m}
              <button
                type="button"
                onClick={() => removeMetro(m)}
                aria-label={`Remove ${m}`}
                disabled={isDisabled}
                className="text-text-primary/40 hover:text-rose-400"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={metroDraft}
            onChange={(e) => setMetroDraft(e.target.value)}
            onKeyDown={(e) => handleChipKeydown(e, addMetro)}
            onBlur={addMetro}
            placeholder="Add metro / county and press Enter"
            disabled={isDisabled}
            className={`${inputClass} flex-1 min-w-[200px]`}
            data-testid="coverage-metro-input"
          />
        </div>
      </FieldRow>

      <FieldRow label={`RADIUS — ${values.radius_miles} mi`}>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={values.radius_miles}
          onChange={(e) => update('radius_miles', Number(e.target.value))}
          disabled={isDisabled}
          className="w-full accent-accent-gold"
          data-testid="coverage-radius"
        />
      </FieldRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="TARGET LEAD COUNT">
          <input
            type="number"
            min={1}
            value={values.target_lead_count}
            onChange={(e) => update('target_lead_count', Number(e.target.value))}
            disabled={isDisabled}
            className={inputClass}
            data-testid="coverage-target-lead-count"
          />
        </FieldRow>

        <FieldRow label="LOOKBACK">
          <select
            value={values.lookback_days}
            onChange={(e) =>
              update('lookback_days', Number(e.target.value) as 14 | 30 | 60 | 90)
            }
            disabled={isDisabled}
            className={inputClass}
            data-testid="coverage-lookback"
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </FieldRow>
      </div>

      <FieldRow label="SIGNAL KEYWORDS">
        <div className="flex flex-wrap items-center gap-2">
          {values.signal_keywords.map((kw) => (
            <span
              key={kw}
              data-testid="coverage-keyword-chip"
              className="mono text-[11px] uppercase tracking-[0.18em] border border-border-default rounded-full px-3 py-1 text-text-primary/80 flex items-center gap-2 bg-bg-panel"
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                aria-label={`Remove ${kw}`}
                disabled={isDisabled}
                className="text-text-primary/40 hover:text-rose-400"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => handleChipKeydown(e, () => addKeyword())}
            onBlur={() => addKeyword()}
            placeholder="Add keyword and press Enter"
            disabled={isDisabled}
            className={`${inputClass} flex-1 min-w-[160px]`}
            data-testid="coverage-keyword-input"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {SUGGESTED_KEYWORDS.filter((s) => !values.signal_keywords.includes(s)).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => addKeyword(s)}
                disabled={isDisabled}
                className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 border border-border-default border-dashed rounded-full px-2 py-0.5 hover:text-accent-gold hover:border-accent-gold/60 transition-colors"
              >
                + {s}
              </button>
            ),
          )}
        </div>
      </FieldRow>

      <FieldRow label="BUDGET CAP (USD, optional)">
        <input
          type="number"
          min={0}
          step={5}
          value={values.budget_usd ?? ''}
          onChange={(e) =>
            update(
              'budget_usd',
              e.target.value === '' ? null : Number(e.target.value),
            )
          }
          placeholder="Defaults to org config"
          disabled={isDisabled}
          className={inputClass}
          data-testid="coverage-budget-cap"
        />
      </FieldRow>

      {error ? (
        <p
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
          data-testid="coverage-form-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isDisabled}
          className="mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="coverage-dispatch-button"
        >
          {submitting ? 'DISPATCHING…' : 'DISPATCH'}
        </button>
      </div>
    </form>
  );
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

/** Convert form values to `CoverageScopeConstraints` for the wire. */
export function toScopeConstraints(values: CoverageInputFormValues): CoverageScopeConstraints {
  return {
    geography: values.metros,
    source_types: ['socrata', 'rest', 'rss', 'json-dump'],
    lookback_days: values.lookback_days,
    signal_keywords: values.signal_keywords,
    target_lead_count: values.target_lead_count,
  };
}
