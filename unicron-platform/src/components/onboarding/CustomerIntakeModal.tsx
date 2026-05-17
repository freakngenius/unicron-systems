import { useEffect, useMemo, useRef, useState } from 'react';
import { slugify, validateSlug } from '../../lib/customersClient';

export type CustomerIntake = {
  name: string;
  slug: string;
  contactName: string;
};

type Props = {
  /** Slugs already taken — used to fail the operator fast on collision. */
  existingSlugs: string[];
  onCancel: () => void;
  onSubmit: (intake: CustomerIntake) => void;
};

export function CustomerIntakeModal({ existingSlugs, onCancel, onSubmit }: Props) {
  const [name, setName] = useState('');
  // `null` = derive slug live from name; non-null = operator overrode the
  // auto-derive. Stored as the literal slug string so we don't replay
  // slugify on every render.
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const slug = slugOverride ?? slugify(name);
  const slugError = useMemo(
    () => (slug ? validateSlug(slug, existingSlugs) : null),
    [slug, existingSlugs],
  );
  const nameError = name.trim().length === 0 ? 'Customer name is required' : null;
  const valid = !nameError && !slugError && slug.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-intake-title"
      data-testid="customer-intake-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        className="w-full max-w-[520px] mx-4 bg-bg-card border border-border-default rounded-lg p-6 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSubmit({ name: name.trim(), slug, contactName: contactName.trim() });
        }}
      >
        <div>
          <h2
            id="customer-intake-title"
            className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-1"
          >
            CUSTOMER INTAKE
          </h2>
          <p className="mono text-[11px] text-text-primary/60">
            Name the customer before the Architect starts decomposing. Slug routes the customer
            URL; you can edit it before deploy.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="customer-intake-name"
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50"
          >
            Customer name <span className="text-rose-400">*</span>
          </label>
          <input
            id="customer-intake-name"
            ref={nameRef}
            data-testid="customer-intake-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Zedcor Surveillance"
            className="bg-bg-base border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-gold/60"
          />
          {nameError ? (
            <p
              data-testid="customer-intake-name-error"
              className="mono text-[10px] text-rose-400"
            >
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="customer-intake-slug"
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50"
          >
            Slug · /customers/{slug || '…'}
          </label>
          <input
            id="customer-intake-slug"
            data-testid="customer-intake-slug-input"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugOverride(e.target.value.toLowerCase());
            }}
            placeholder="auto-derived from name"
            className="bg-bg-base border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-gold/60"
          />
          {slugError ? (
            <p
              data-testid="customer-intake-slug-error"
              className="mono text-[10px] text-rose-400"
            >
              {slugError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="customer-intake-contact"
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50"
          >
            Primary contact name <span className="text-text-primary/40">(optional)</span>
          </label>
          <input
            id="customer-intake-contact"
            data-testid="customer-intake-contact-input"
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="e.g. Doug Sharpe"
            className="bg-bg-base border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-gold/60"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            data-testid="customer-intake-cancel"
            className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2 px-4 rounded-md hover:border-border-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            data-testid="customer-intake-submit"
            className={[
              'bg-accent-primary text-white mono text-[12px] tracking-[0.12em] uppercase py-2 px-5 rounded-md transition-all',
              valid ? 'hover:bg-accent-primary/90' : 'opacity-40 cursor-not-allowed',
            ].join(' ')}
          >
            Start Architect →
          </button>
        </div>
      </form>
    </div>
  );
}
