import { useState, type FormEvent } from 'react';
import type { AgentFormField, AgentFormSchema } from '../../lib/agentRegistry';

interface Props {
  schema: AgentFormSchema;
  /** Disable the form (e.g. while a dispatch is in flight). */
  disabled?: boolean;
  /** Called with the form values keyed by field name. */
  onSubmit: (values: Record<string, string | number>) => void | Promise<void>;
  /** Submit button label override. */
  submitLabel?: string;
}

export function AgentInputForm({ schema, disabled, onSubmit, submitLabel = 'DISPATCH' }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(schema.fields.map((f) => [f.name, ''])),
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled || submitting) return;
    setSubmitting(true);
    try {
      const coerced: Record<string, string | number> = {};
      for (const f of schema.fields) {
        const raw = values[f.name] ?? '';
        if (f.type === 'number') {
          coerced[f.name] = raw === '' ? Number.NaN : Number(raw);
        } else {
          coerced[f.name] = raw;
        }
      }
      await onSubmit(coerced);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {schema.fields.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          value={values[field.name] ?? ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
          disabled={disabled || submitting}
        />
      ))}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled || submitting}
          className="mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'DISPATCHING…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  disabled,
}: {
  field: AgentFormField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputClass =
    'bg-bg-panel border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-accent-gold/60 disabled:opacity-50';

  return (
    <label className="flex flex-col gap-1">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        {field.label}
        {field.required ? <span className="text-rose-400"> *</span> : null}
      </span>
      {field.type === 'textarea' ? (
        <textarea
          name={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
          disabled={disabled}
          rows={4}
          className={inputClass}
        />
      ) : field.type === 'select' ? (
        <select
          name={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          disabled={disabled}
          className={inputClass}
        >
          <option value="">{field.placeholder ?? 'Select…'}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          name={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
          disabled={disabled}
          className={inputClass}
        />
      )}
    </label>
  );
}
