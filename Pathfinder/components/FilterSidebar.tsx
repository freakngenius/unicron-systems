// components/FilterSidebar.tsx — Build-Out Pass Slice 2.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Renders the per-org filter sidebar driven by ui_plan.filters.
// Each filter has a field name, a display label, and an optional
// default value. Slice 2 ships layout only — the inputs hold state
// but do not feed back into the leads query yet (Slice 3+ wires that
// alongside the headless verification agent).

'use client';

import * as React from 'react';
import { useState } from 'react';
import type { UIPlan } from '@/lib/types/architecture';

void React;

export type FilterSidebarProps = {
  filters: UIPlan['filters'];
};

function defaultToString(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

export function FilterSidebar({ filters }: FilterSidebarProps) {
  // Local state per field. Initial values populated from filter.default.
  const initial: Record<string, string> = {};
  for (const f of filters) initial[f.field] = defaultToString(f.default);
  const [values, setValues] = useState<Record<string, string>>(initial);

  return (
    <aside
      data-filter-sidebar
      style={{
        background: '#0d0d0d',
        border: '1px solid #1d1d1d',
        borderRadius: 6,
        padding: '1rem',
        minWidth: 220,
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.6rem',
        }}
      >
        Filters
      </div>
      {filters.map(filter => (
        <div
          key={filter.field}
          data-filter-control
          data-field={filter.field}
          style={{ marginBottom: '0.75rem' }}
        >
          <label
            style={{
              display: 'block',
              color: '#aaa',
              fontSize: '0.75rem',
              marginBottom: '0.25rem',
            }}
          >
            {filter.label}
          </label>
          <input
            type="text"
            name={filter.field}
            value={values[filter.field] ?? ''}
            onChange={e => setValues(prev => ({ ...prev, [filter.field]: e.target.value }))}
            style={{
              width: '100%',
              padding: '0.4rem 0.5rem',
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 4,
              color: '#fff',
              fontSize: '0.8rem',
            }}
          />
        </div>
      ))}
    </aside>
  );
}

export default FilterSidebar;
