// __tests__/agents/internal-enricher.test.ts
//
// Stage 5 — Internal enricher.
//
// Validates the JSON parser (no LLM call). The live Sonar call path is
// exercised via integration in the inngest pipeline tests.

import { describe, it, expect } from 'vitest';
import {
  parseInternalEnrichment,
  INTERNAL_SERVICE_CATEGORIES,
} from '@/lib/agents/internal/enricher';

describe('parseInternalEnrichment', () => {
  it('parses a well-formed payload', () => {
    const text = JSON.stringify({
      website: 'https://acme.example',
      linkedin: 'https://linkedin.com/company/acme',
      employee_count: 42,
      service_category: 'temp-fence',
      sales_motion: 'hiring-bd',
      contacts: [
        { name: 'Jane Doe', title: 'VP Sales', linkedin_url: 'https://linkedin.com/in/jane' },
      ],
      associations: ['ARA', 'AGC'],
      brief: 'Acme rents temp fencing across TX and OK.',
    });
    const parsed = parseInternalEnrichment(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.service_category).toBe('temp-fence');
    expect(parsed!.sales_motion).toBe('hiring-bd');
    expect(parsed!.contacts).toHaveLength(1);
    expect(parsed!.associations).toEqual(['ARA', 'AGC']);
  });

  it('clamps service_category to enum, returning null for unknown values', () => {
    const text = JSON.stringify({ service_category: 'not-a-real-category' });
    const parsed = parseInternalEnrichment(text);
    expect(parsed!.service_category).toBeNull();
  });

  it('clamps sales_motion to enum', () => {
    const text = JSON.stringify({ sales_motion: 'highly-motivated' });
    const parsed = parseInternalEnrichment(text);
    expect(parsed!.sales_motion).toBeNull();
  });

  it('drops contacts with missing name', () => {
    const text = JSON.stringify({
      contacts: [{ title: 'VP Sales' }, { name: 'Jane Doe' }],
    });
    const parsed = parseInternalEnrichment(text);
    expect(parsed!.contacts).toHaveLength(1);
    expect(parsed!.contacts[0].name).toBe('Jane Doe');
  });

  it('returns null for non-JSON input', () => {
    expect(parseInternalEnrichment('not json at all')).toBeNull();
    expect(parseInternalEnrichment('')).toBeNull();
    expect(parseInternalEnrichment('{ not json')).toBeNull();
  });

  it('exports all 14 service categories from the architecture enum', () => {
    expect(INTERNAL_SERVICE_CATEGORIES).toContain('equipment-rental');
    expect(INTERNAL_SERVICE_CATEGORIES).toContain('general-contractor');
    expect(INTERNAL_SERVICE_CATEGORIES).toContain('other');
    expect(INTERNAL_SERVICE_CATEGORIES.length).toBe(14);
  });
});
