import { useEffect, useRef, useState } from 'react';
import type { BusinessSummary } from '../lib/contracts/architect';

export type BusinessSummaryStatus = 'loading' | 'ready' | 'error';

type Props = {
  summary: BusinessSummary | null | undefined;
  customerName: string;
  onEdit: (field: keyof BusinessSummary, value: string) => void;
  readOnly?: boolean;
  status?: BusinessSummaryStatus;
  errorMessage?: string;
};

type SectionKey = 'lead' | 'problem' | 'deliverable';

type SectionDef = {
  key: SectionKey;
  label: string;
  fields: { field: keyof BusinessSummary; label?: string }[];
};

const SECTIONS: SectionDef[] = [
  {
    key: 'lead',
    label: 'LEAD TYPE & BUSINESS AREA',
    fields: [
      { field: 'lead_type', label: 'Lead type' },
      { field: 'business_area', label: 'Business area' },
    ],
  },
  {
    key: 'problem',
    label: 'PROBLEM WE SOLVE',
    fields: [{ field: 'problem_solved' }],
  },
  {
    key: 'deliverable',
    label: 'WHAT THEY GET',
    fields: [{ field: 'what_they_get' }],
  },
];

export function BusinessSummaryPanel({
  summary,
  customerName,
  onEdit,
  readOnly,
  status,
  errorMessage,
}: Props) {
  const resolvedStatus: BusinessSummaryStatus =
    status ?? (summary ? 'ready' : 'loading');

  const headline = customerName
    ? `WHAT ${customerName.toUpperCase()} GETS`
    : 'WHAT THE CUSTOMER GETS';

  return (
    <section
      data-testid="business-summary-panel"
      aria-label="Business summary"
      className="bg-bg-card border border-border-default rounded-lg p-6"
    >
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-5">
        {headline}
      </div>

      {resolvedStatus === 'error' ? (
        <ErrorState message={errorMessage} />
      ) : resolvedStatus === 'loading' || !summary ? (
        <SkeletonState />
      ) : (
        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <Section
              key={section.key}
              section={section}
              summary={summary}
              onEdit={onEdit}
              readOnly={Boolean(readOnly)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Section({
  section,
  summary,
  onEdit,
  readOnly,
}: {
  section: SectionDef;
  summary: BusinessSummary;
  onEdit: (field: keyof BusinessSummary, value: string) => void;
  readOnly: boolean;
}) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-[0.22em] text-text-secondary mb-2">
        {section.label}
      </div>
      <div className="flex flex-col gap-3">
        {section.fields.map((f) => (
          <EditableField
            key={f.field}
            field={f.field}
            label={f.label}
            value={summary[f.field]}
            onEdit={onEdit}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

function humanizeField(field: keyof BusinessSummary): string {
  return field.replace(/_/g, ' ');
}

function EditableField({
  field,
  label,
  value,
  onEdit,
  readOnly,
}: {
  field: keyof BusinessSummary;
  label?: string;
  value: string;
  onEdit: (field: keyof BusinessSummary, value: string) => void;
  readOnly: boolean;
}) {
  const accessibleName = label ?? humanizeField(field);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Keep draft in sync when external value changes (e.g., new decomposition)
  // and we're not actively editing this field.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus + autosize on entering edit mode.
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  const commit = () => {
    if (draft !== value) onEdit(field, draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={`bsp-${field}`}
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={`bsp-${field}`}
          aria-label={accessibleName}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className="bg-bg-input border border-border-hover rounded-md p-3 sans text-[13px] leading-[1.55] text-text-primary resize-none focus:outline-none focus:border-accent-gold"
        />
        <div className="flex items-center gap-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">
            ⌘↵ save · esc cancel
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1">
      {label && (
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">
          {label}
        </span>
      )}
      <div className="flex items-start gap-2">
        <p
          className="sans text-[13px] leading-[1.55] text-text-primary flex-1"
          data-field={field}
        >
          {value}
        </p>
        {!readOnly && (
          <button
            type="button"
            aria-label={`edit ${accessibleName}`}
            onClick={() => setEditing(true)}
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-accent-gold transition-colors shrink-0"
          >
            ✎ edit
          </button>
        )}
      </div>
    </div>
  );
}

function SkeletonState() {
  return (
    <div
      data-testid="business-summary-skeleton"
      className="flex flex-col gap-6"
    >
      {SECTIONS.map((section) => (
        <div key={section.key}>
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-text-secondary mb-2">
            {section.label}
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-3 rounded bg-border-default animate-pulseDot w-[80%]" />
            <div className="h-3 rounded bg-border-default animate-pulseDot w-[60%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      data-testid="business-summary-error"
      className="mono text-[12px] text-accent-magenta border border-accent-magenta/40 rounded-md p-4"
    >
      {message ??
        'Architect did not complete a business summary. Edit manually below or rerun decomposition.'}
    </div>
  );
}
