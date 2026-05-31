// components/search/NewSearchForm.tsx, ICP Search S3.
//
// Client component for the Internal front-page "New Search" feature.
// Collects four fields (name optional, ICP text, region, radius miles,
// optional fit notes), POSTs to /api/searches via lib/searches/api, and
// navigates to the new search's per-id results page on success.
//
// The form is intentionally bare and unstyled-decoratively; the visual
// language matches the Internal dashboard's existing tokens (dark bg,
// thin borders, mono eyebrows). No external form library; native form
// elements keep the bundle small.

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createSearch, SearchApiError } from '@/lib/searches/api';
import { buildOrgPath } from '@/lib/nav/orgPath';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';

void React;

export interface NewSearchFormProps {
  slug: string;
}

type FormState = 'idle' | 'submitting' | 'error';

const DEFAULT_RADIUS = 50;

export function NewSearchForm({ slug }: NewSearchFormProps): React.ReactElement {
  const router = useRouter();
  const [state, setState] = React.useState<FormState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [icpText, setIcpText] = React.useState('');
  const [region, setRegion] = React.useState('');
  const [radiusMi, setRadiusMi] = React.useState<number>(DEFAULT_RADIUS);
  const [fitNotes, setFitNotes] = React.useState('');

  const onSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (state === 'submitting') return;
      setError(null);
      const icp = icpText.trim();
      const reg = region.trim();
      if (!icp) {
        setError('Tell the hunter who you target.');
        return;
      }
      if (!reg) {
        setError('Add a region so the geo resolver has somewhere to search.');
        return;
      }
      if (!Number.isFinite(radiusMi) || radiusMi <= 0) {
        setError('Radius must be a positive number of miles.');
        return;
      }
      setState('submitting');
      try {
        const res = await createSearch({
          name: name.trim() || defaultName(icp, reg),
          icp_text: icp,
          region: reg,
          radius_mi: Math.round(radiusMi),
          fit_notes: fitNotes.trim() || undefined,
        });
        if (!res?.id) {
          throw new Error('API did not return a search id.');
        }
        router.push(buildOrgPath(slug, 'searches', res.id));
      } catch (err) {
        const message =
          err instanceof SearchApiError
            ? `Could not start the search (${err.status}). Try again or check the API.`
            : err instanceof Error
              ? err.message
              : 'Unknown error starting the search.';
        setError(message);
        setState('error');
      }
    },
    [state, icpText, region, radiusMi, name, fitNotes, router, slug],
  );

  return (
    <section
      data-testid="new-search-form"
      style={{
        border: `1px solid ${color.border}`,
        background: color.bgRaised,
        borderRadius: radius.lg,
        padding: space.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: space.md,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        <p
          style={{
            margin: 0,
            color: color.textMuted,
            fontFamily: font.mono,
            fontSize: fontSize.eyebrow,
            letterSpacing: letterSpacing.wider,
            textTransform: 'uppercase',
          }}
        >
          New search
        </p>
        <h2
          style={{
            margin: 0,
            fontFamily: font.sans,
            fontSize: fontSize.xl,
            fontWeight: fontWeight.semi,
            color: color.text,
          }}
        >
          Hunt a new ICP
        </h2>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
        <Field label="Who you target" required>
          <textarea
            data-testid="new-search-icp"
            value={icpText}
            onChange={e => setIcpText(e.target.value)}
            rows={3}
            placeholder="e.g. construction GCs running mobile job sites that need temporary site security"
            style={inputStyle({ minHeight: 72 })}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: space.md }}>
          <Field label="Region" required>
            <input
              data-testid="new-search-region"
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="Houston, TX"
              style={inputStyle()}
            />
          </Field>
          <Field label="Radius (mi)" required>
            <input
              data-testid="new-search-radius"
              type="number"
              min={1}
              step={1}
              value={Number.isFinite(radiusMi) ? radiusMi : ''}
              onChange={e => setRadiusMi(Number(e.target.value))}
              style={inputStyle()}
            />
          </Field>
        </div>

        <Field label="Name (optional)">
          <input
            data-testid="new-search-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="defaults to a region + ICP summary"
            style={inputStyle()}
          />
        </Field>

        <Field label="Fit notes (optional)">
          <textarea
            data-testid="new-search-fit-notes"
            value={fitNotes}
            onChange={e => setFitNotes(e.target.value)}
            rows={2}
            placeholder="anything else that helps the planner: budgets, exclusions, ideal team size"
            style={inputStyle({ minHeight: 60 })}
          />
        </Field>

        {error ? (
          <p
            data-testid="new-search-error"
            role="alert"
            style={{
              margin: 0,
              color: color.danger,
              fontSize: fontSize.sm,
              fontFamily: font.sans,
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            data-testid="new-search-submit"
            type="submit"
            disabled={state === 'submitting'}
            style={{
              padding: `${space.sm}px ${space.lg}px`,
              borderRadius: radius.md,
              border: `1px solid ${color.borderStrong}`,
              background: state === 'submitting' ? color.bgSubtle : color.accentSoft,
              color: color.text,
              fontFamily: font.sans,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.semi,
              cursor: state === 'submitting' ? 'progress' : 'pointer',
            }}
          >
            {state === 'submitting' ? 'Starting search...' : 'Start search'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
      <span
        style={{
          color: color.textMuted,
          fontFamily: font.mono,
          fontSize: fontSize.eyebrow,
          letterSpacing: letterSpacing.wide,
          textTransform: 'uppercase',
        }}
      >
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function inputStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: color.bg,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    color: color.text,
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    padding: `${space.sm}px ${space.md}px`,
    width: '100%',
    boxSizing: 'border-box',
    ...extra,
  };
}

function defaultName(icp: string, region: string): string {
  const short = icp.length > 40 ? `${icp.slice(0, 40).trim()}...` : icp;
  return `${short} (${region})`;
}

export default NewSearchForm;
