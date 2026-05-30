// __tests__/catalog/modules/ranked-feed/labels.test.ts, Stream B Dashboard.
//
// Display labels are a thin reader of architecture.lead_unit.schema[key].display_label.
// The rendered dashboard never shows a raw key. Unknown keys fall back to a
// humanized form so a misconfiguration cannot leak a raw key into the UI.

import { describe, it, expect } from 'vitest';
import { displayLabel, humanizeKey } from '@/lib/catalog/modules/ranked-feed/labels';

const internalSchema = {
  company_name: { type: 'string', display_label: 'Company', required: true },
  service_category: {
    type: 'enum',
    display_label: 'Service category',
    enum_values: ['equipment-rental', 'temp-fence'],
  },
  sales_motion: {
    type: 'enum',
    display_label: 'Sales motion',
    enum_values: ['active-outbound', 'inbound-only'],
  },
  footprint: { type: 'object', display_label: 'Operating footprint' },
  hq_location: { type: 'string', display_label: 'Headquarters' },
  licensure: { type: 'object', display_label: 'Contractor licensure' },
  federal_registration: {
    type: 'enum',
    display_label: 'Federal registration',
    enum_values: ['sam-registered', 'none'],
  },
  association_memberships: { type: 'object', display_label: 'Trade associations' },
  company_size: { type: 'string', display_label: 'Size' },
  warm_intro: { type: 'string', display_label: 'Warm intro' },
  first_step: { type: 'string', display_label: 'Recommended first step' },
  score: { type: 'number', display_label: 'Score' },
  source: { type: 'string', display_label: 'Source' },
};

describe('displayLabel', () => {
  it('reads display_label from the schema for every spec field', () => {
    expect(displayLabel(internalSchema, 'company_name')).toBe('Company');
    expect(displayLabel(internalSchema, 'service_category')).toBe('Service category');
    expect(displayLabel(internalSchema, 'sales_motion')).toBe('Sales motion');
    expect(displayLabel(internalSchema, 'footprint')).toBe('Operating footprint');
    expect(displayLabel(internalSchema, 'hq_location')).toBe('Headquarters');
    expect(displayLabel(internalSchema, 'licensure')).toBe('Contractor licensure');
    expect(displayLabel(internalSchema, 'federal_registration')).toBe('Federal registration');
    expect(displayLabel(internalSchema, 'association_memberships')).toBe('Trade associations');
    expect(displayLabel(internalSchema, 'company_size')).toBe('Size');
    expect(displayLabel(internalSchema, 'warm_intro')).toBe('Warm intro');
    expect(displayLabel(internalSchema, 'first_step')).toBe('Recommended first step');
    expect(displayLabel(internalSchema, 'score')).toBe('Score');
    expect(displayLabel(internalSchema, 'source')).toBe('Source');
  });

  it('falls back to a humanized key when display_label is missing (never renders raw)', () => {
    const partial = { company_name: { type: 'string' } } as Record<string, { display_label?: string }>;
    expect(displayLabel(partial, 'company_name')).toBe('Company name');
  });

  it('falls back to a humanized key when the schema entry is absent', () => {
    expect(displayLabel({}, 'some_unknown_field')).toBe('Some unknown field');
    expect(displayLabel(undefined, 'company_name')).toBe('Company name');
  });

  it('also humanizes a kebab-case enum value to a readable token', () => {
    expect(humanizeKey('active-outbound')).toBe('Active outbound');
    expect(humanizeKey('sam-registered')).toBe('Sam registered');
    expect(humanizeKey('equipment-rental')).toBe('Equipment rental');
  });
});
