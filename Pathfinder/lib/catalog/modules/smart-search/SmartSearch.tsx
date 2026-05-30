'use client';

// lib/catalog/modules/smart-search/SmartSearch.tsx, Stream F.
//
// One smart search bar that replaces the four dead text inputs from the
// legacy components/FilterSidebar. Typing into the bar updates `?q=` in
// the URL (debounced) and the server component re-fetches the Internal
// feed narrowed through applyFilters + applySearchQuery.
//
// Beside (or beneath, on narrow viewports) the bar sits a row of four
// optional dropdown refinements covering the same four Internal fields
// the FilterRail uses: service_category, sales_motion, federal_registration,
// source. Each dropdown writes its own URL param; the smart-search input
// owns `q`. The two surfaces compose cleanly because applyFilters' four
// field-filters run first and the search narrowing runs after.
//
// A filter whose backing schema field is absent from the org architecture
// is dropped from the dropdown row entirely (matches FilterRail behavior).
// A11y: input has a visible label, every dropdown has a visible label, and
// a "Clear all" link appears when any of q + the four params are non-empty.

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';
import {
  displayLabel,
  humanizeKey,
  type LeadUnitSchema,
  type SchemaEntry,
} from '@/lib/catalog/modules/ranked-feed/labels';
import type { InternalFilters } from '@/lib/catalog/modules/filter-rail/applyFilters';

void React;

const FIELDS: ReadonlyArray<keyof InternalFilters> = [
  'service_category',
  'sales_motion',
  'federal_registration',
  'source',
];

export interface SmartSearchProps {
  schema: LeadUnitSchema;
  sources: ReadonlyArray<{ id: string }>;
  initialFilters: InternalFilters;
  /**
   * Debounce window for `q` URL writes. Smaller in tests for snappier
   * assertions; default 200ms in production.
   */
  debounceMs?: number;
}

export function SmartSearch({
  schema,
  sources,
  initialFilters,
  debounceMs = 200,
}: SmartSearchProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draft, setDraft] = React.useState<string>(initialFilters.q ?? '');
  // Keep the input in sync if the URL changes outside of this control
  // (deep link, browser back button, etc.).
  React.useEffect(() => {
    setDraft(initialFilters.q ?? '');
    // initialFilters.q comes from the server via the page; treat it as the
    // source of truth on remount.
  }, [initialFilters.q]);

  const writeUrl = React.useCallback(
    (next: { q?: string; field?: keyof InternalFilters; value?: string }) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (typeof next.q === 'string') {
        if (next.q.trim() === '') params.delete('q');
        else params.set('q', next.q);
      }
      if (next.field) {
        if (!next.value || next.value === '') params.delete(next.field);
        else params.set(next.field, next.value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  // Debounced URL write for the smart-search input. The draft state keeps
  // the input snappy; the URL update lags by debounceMs so we don't fire a
  // server round-trip on every keystroke.
  React.useEffect(() => {
    if ((initialFilters.q ?? '') === draft) return;
    const handle = setTimeout(() => writeUrl({ q: draft }), debounceMs);
    return () => clearTimeout(handle);
  }, [draft, initialFilters.q, debounceMs, writeUrl]);

  const visibleDropdowns = React.useMemo(() => {
    const out: Array<{
      field: keyof InternalFilters;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    }> = [];
    for (const field of FIELDS) {
      const entry = schema?.[field];
      if (!entry) continue;
      out.push({
        field,
        label: displayLabel(schema, field),
        options: optionsFor(field, entry, sources),
      });
    }
    return out;
  }, [schema, sources]);

  const anySelection =
    (draft.trim() !== '') ||
    FIELDS.some((f) => ((initialFilters[f] ?? '') as string).trim() !== '');

  const clearAll = React.useCallback(() => {
    setDraft('');
    router.replace(pathname);
  }, [router, pathname]);

  return (
    <div
      data-testid="smart-search"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.md,
          flexWrap: 'wrap',
        }}
      >
        <label
          htmlFor="smart-search-input"
          style={{
            color: color.textMuted,
            fontFamily: font.mono,
            fontSize: fontSize.eyebrow,
            letterSpacing: letterSpacing.wider,
            textTransform: 'uppercase',
            fontWeight: fontWeight.medium,
          }}
        >
          Search
        </label>
        <input
          id="smart-search-input"
          data-testid="smart-search-input"
          type="search"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by company, category, state, or score"
          style={{
            flex: 1,
            minWidth: 260,
            background: color.bgRaised,
            color: color.text,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            padding: `${space.md}px ${space.lg}px`,
            fontFamily: font.sans,
            fontSize: fontSize.md,
            outline: 'none',
          }}
        />
        {anySelection ? (
          <button
            type="button"
            data-testid="smart-search-clear"
            onClick={clearAll}
            style={{
              background: 'transparent',
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              color: color.textMuted,
              cursor: 'pointer',
              fontFamily: font.sans,
              fontSize: fontSize.sm,
              padding: `${space.sm}px ${space.md}px`,
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {visibleDropdowns.length === 0 ? null : (
        <div
          data-testid="smart-search-refinements"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`,
            gap: space.md,
          }}
        >
          {visibleDropdowns.map(({ field, label, options }) => {
            const current = ((initialFilters[field] ?? '') as string).trim();
            return (
              <div key={field}>
                <label
                  htmlFor={`smart-search-${field}`}
                  style={{
                    display: 'block',
                    marginBottom: space.xs,
                    color: color.textMuted,
                    fontFamily: font.mono,
                    fontSize: fontSize.eyebrow,
                    letterSpacing: letterSpacing.wider,
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </label>
                <select
                  id={`smart-search-${field}`}
                  data-testid={`smart-search-filter-${field}`}
                  value={current}
                  onChange={(e) => writeUrl({ field, value: e.target.value })}
                  style={{
                    width: '100%',
                    background: color.bgRaised,
                    color: color.text,
                    border: `1px solid ${color.border}`,
                    borderRadius: radius.md,
                    padding: `${space.sm}px ${space.md}px`,
                    fontFamily: font.sans,
                    fontSize: fontSize.sm,
                  }}
                >
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function optionsFor(
  field: keyof InternalFilters,
  entry: SchemaEntry,
  sources: ReadonlyArray<{ id: string }>,
): ReadonlyArray<{ value: string; label: string }> {
  const allOption = { value: '', label: `All ${humanizeKey(String(field)).toLowerCase()}` };
  if (field === 'source') {
    return [allOption, ...sources.map((s) => ({ value: s.id, label: humanizeKey(s.id) }))];
  }
  const enumValues = entry.enum_values ?? [];
  return [allOption, ...enumValues.map((v) => ({ value: v, label: humanizeKey(v) }))];
}

export default SmartSearch;
