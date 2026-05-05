import { useEffect, useMemo, useRef, useState } from 'react';
import { slugify, validateSlug } from '../../lib/customersClient';

type Props = {
  /** Sensible default name derived from the buyer-pain prompt. */
  defaultName: string;
  /** Slugs already taken — used to fail the operator fast on collision. */
  existingSlugs: string[];
  /** True while the parent is mid-persist (POST in flight). */
  submitting: boolean;
  /** Server-side error message to surface (e.g. unexpected 5xx). */
  serverError: string | null;
  onCancel: () => void;
  onConfirm: (input: { name: string; slug: string }) => void;
  /** Called on every name keystroke so parent can sync to BusinessSummaryPanel. */
  onNameChange?: (name: string) => void;
};

/**
 * Derive an initial display name from a buyer-pain prompt. Picks the first
 * meaningful noun phrase by trimming on common preamble words and capping
 * at 5 words / 60 chars.
 */
export function deriveDefaultName(buyerPain: string): string {
  const trimmed = buyerPain.trim();
  if (!trimmed) return 'New customer';
  const cleaned = trimmed
    .replace(/^(we|i|our|my|the)\s+/i, '')
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').slice(0, 5).join(' ');
  const capped = words.slice(0, 60).trim();
  if (!capped) return 'New customer';
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

export function ApproveDeployModal({
  defaultName,
  existingSlugs,
  submitting,
  serverError,
  onCancel,
  onConfirm,
  onNameChange,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(slugify(defaultName));
  const [slugTouched, setSlugTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  // Auto-derive slug from name until the operator manually edits the slug.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(name));
  }, [name, slugTouched]);

  const slugError = useMemo(
    () => validateSlug(slug, existingSlugs),
    [slug, existingSlugs],
  );
  const nameError = name.trim().length === 0 ? 'Name is required' : null;
  const valid = !nameError && !slugError && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-deploy-title"
      data-testid="approve-deploy-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <form
        className="w-full max-w-[480px] mx-4 bg-bg-card border border-border-default rounded-lg p-6 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onConfirm({ name: name.trim(), slug });
        }}
      >
        <div>
          <h2
            id="approve-deploy-title"
            className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-1"
          >
            APPROVE &amp; DEPLOY
          </h2>
          <p className="mono text-[11px] text-text-primary/60">
            Name the new customer cluster before persistence.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="approve-deploy-name"
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50"
          >
            Customer name
          </label>
          <input
            id="approve-deploy-name"
            ref={nameRef}
            data-testid="approve-deploy-name-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onNameChange?.(e.target.value);
            }}
            disabled={submitting}
            className="bg-bg-base border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-gold/60 disabled:opacity-40"
          />
          {nameError ? (
            <p
              data-testid="approve-deploy-name-error"
              className="mono text-[10px] text-rose-400"
            >
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="approve-deploy-slug"
            className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50"
          >
            Slug · /customers/{slug || '…'}
          </label>
          <input
            id="approve-deploy-slug"
            data-testid="approve-deploy-slug-input"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            disabled={submitting}
            className="bg-bg-base border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-gold/60 disabled:opacity-40"
          />
          {slugError ? (
            <p
              data-testid="approve-deploy-slug-error"
              className="mono text-[10px] text-rose-400"
            >
              {slugError}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <p
            data-testid="approve-deploy-server-error"
            className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3"
          >
            {serverError}
          </p>
        ) : null}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            data-testid="approve-deploy-cancel"
            className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2 px-4 rounded-md hover:border-border-hover disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            data-testid="approve-deploy-confirm"
            className={[
              'bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-2 px-5 rounded-md transition-all',
              valid ? 'hover:bg-text-primary' : 'opacity-40 cursor-not-allowed',
            ].join(' ')}
          >
            {submitting ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </form>
    </div>
  );
}
