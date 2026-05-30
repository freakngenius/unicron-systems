'use client';

// lib/catalog/modules/filter-rail/FilterRail.tsx, Stream B Dashboard.
//
// Module 2: filter rail (slot dashboard.filters) for Internal. Renders one
// select per configured filter on (service_category, sales_motion,
// federal_registration, source). A filter whose backing field is absent
// from the org's lead_unit.schema is DROPPED from the rail entirely,
// not rendered as a disabled control. This matches the spec's per-element
// soft gate.
//
// Selections are persisted to URL search params so the server component
// for the page re-renders with narrowed feed data on the next paint. The
// component is client-side because select.onChange needs to push the new
// URL and because the design is "filter applies on change", not "submit
// to filter".

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SectionHeader } from '@/components/design/SectionHeader';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';
import { displayLabel, humanizeKey, type LeadUnitSchema, type SchemaEntry } from '@/lib/catalog/modules/ranked-feed/labels';
import type { InternalFilters } from './applyFilters';

void React;

const FILTER_ORDER: ReadonlyArray<keyof InternalFilters> = [
  'service_category',
  'sales_motion',
  'federal_registration',
  'source',
];

export interface FilterRailProps {
  schema: LeadUnitSchema;
  sources: ReadonlyArray<{ id: string }>;
  initialFilters: InternalFilters;
}

export function FilterRail({ schema, sources, initialFilters }: FilterRailProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build the rendered list once per render. A filter is included only
  // when the schema declares its backing field, so a misconfiguration
  // produces "filter absent from the DOM" rather than "broken control".
  const visible = React.useMemo(() => {
    const out: Array<{ field: keyof InternalFilters; label: string; options: ReadonlyArray<{ value: string; label: string }> }> = [];
    for (const field of FILTER_ORDER) {
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

  const updateFilter = React.useCallback(
    (field: keyof InternalFilters, value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (value === '') {
        params.delete(field);
      } else {
        params.set(field, value);
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url);
    },
    [router, pathname, searchParams],
  );

  return (
    <aside
      data-testid="filter-rail"
      style={{
        background: color.bgSubtle,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: `${space.lg}px ${space.lg}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: space.lg,
      }}
    >
      <SectionHeader eyebrow="Filter" title="Filters" />

      {visible.length === 0 ? (
        <div
          data-testid="filter-rail-empty"
          style={{ color: color.textMuted, fontFamily: font.sans, fontSize: fontSize.sm }}
        >
          No filters configured for this org.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          {visible.map(({ field, label, options }) => {
            const currentValue = (initialFilters[field] ?? '').trim();
            return (
              <div key={field}>
                <label
                  htmlFor={`filter-${field}-select`}
                  style={{
                    display: 'block',
                    marginBottom: space.xs,
                    color: color.textMuted,
                    fontFamily: font.mono,
                    fontSize: fontSize.eyebrow,
                    fontWeight: fontWeight.medium,
                    letterSpacing: letterSpacing.wider,
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </label>
                <select
                  id={`filter-${field}-select`}
                  data-testid={`filter-${field}`}
                  value={currentValue}
                  onChange={(e) => updateFilter(field, e.target.value)}
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
    </aside>
  );
}

function optionsFor(
  field: keyof InternalFilters,
  entry: SchemaEntry,
  sources: ReadonlyArray<{ id: string }>,
): ReadonlyArray<{ value: string; label: string }> {
  const allOption = { value: '', label: `All ${displayLabel(undefined, String(field)).toLowerCase()}` };
  if (field === 'source') {
    return [allOption, ...sources.map((s) => ({ value: s.id, label: humanizeKey(s.id) }))];
  }
  const enumValues = entry.enum_values ?? [];
  return [allOption, ...enumValues.map((v) => ({ value: v, label: humanizeKey(v) }))];
}

export default FilterRail;
