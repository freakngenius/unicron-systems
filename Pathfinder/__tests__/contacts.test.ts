// __tests__/contacts.test.ts — unit tests for the pure helpers in
// lib/contacts/extractor.ts. Covers the email validator, the SAM.gov
// pointOfContact parser, the USAspending recipient_name path, and the
// dispatcher. The test fixtures are sanitized real-shape payloads
// committed under __tests__/fixtures/.
//
// No external SDKs are exercised; v2 modules (apollo, hunter, sonar,
// budget, resolver) don't exist yet — their tests ship with the v2 PR.

import { describe, expect, it } from 'vitest';
import samGovFixture from './fixtures/sam-gov-sample.json';
import usaspendingFixture from './fixtures/usaspending-sample.json';
import {
  extractContacts,
  extractFromSamGov,
  extractFromUSAspending,
  isValidEmail,
  SAM_GOV_CONFIDENCE,
  USASPENDING_CONFIDENCE,
} from '@/lib/contacts/extractor';
import type { Project } from '@/lib/types';

const TEST_PROJECT_ID = 'P-test-001';

// ────────────────────────────────────────────────────────────────────────
// Email validator
// ────────────────────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it.each([
    ['a@b.com', true],
    ['jane.smith@va.gov', true],
    ['name+tag@example.co', true],
    ['x@y.zz', true],
  ])('passes %s', (s, want) => {
    expect(isValidEmail(s)).toBe(want);
  });

  it.each([
    ['', false, 'empty'],
    ['abc', false, 'no @'],
    ['a@', false, 'no domain'],
    ['@b.com', false, 'no local'],
    ['a@b', false, 'no TLD'],
    ['a b@c.com', false, 'whitespace in local'],
    ['a@b c.com', false, 'whitespace in domain'],
  ])('rejects "%s" (%s)', (s, want) => {
    expect(isValidEmail(s)).toBe(want);
  });
});

// ────────────────────────────────────────────────────────────────────────
// SAM.gov extractor
// ────────────────────────────────────────────────────────────────────────

describe('extractFromSamGov', () => {
  it('returns empty for empty payload', () => {
    expect(extractFromSamGov({}, TEST_PROJECT_ID)).toEqual({
      contacts: [],
      skipped: [],
    });
  });

  it('returns empty when pointOfContact is not an array', () => {
    expect(extractFromSamGov({ pointOfContact: null }, TEST_PROJECT_ID)).toEqual({
      contacts: [],
      skipped: [],
    });
    expect(
      extractFromSamGov({ pointOfContact: 'not an array' }, TEST_PROJECT_ID),
    ).toEqual({ contacts: [], skipped: [] });
  });

  it('extracts every valid POC from real-shape payload', () => {
    const result = extractFromSamGov(samGovFixture, TEST_PROJECT_ID);
    expect(result.contacts).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    const [first, second] = result.contacts;
    expect(first).toMatchObject({
      project_id: TEST_PROJECT_ID,
      contact_role: 'contracting_officer',
      full_name: 'Jane Smith',
      email: 'jane.smith@va.gov',
      phone: '713-555-0100',
      linkedin_url: null,
      company: null,
      title: 'Contracting Officer',
      source: 'raw_payload',
      confidence: SAM_GOV_CONFIDENCE,
      inferred: false,
    });
    expect(second.full_name).toBe('Robert Johnson');
    expect(second.email).toBe('robert.johnson@va.gov');
    expect(second.contact_role).toBe('contracting_officer');
  });

  it('skips POC with no full_name (no_name)', () => {
    const result = extractFromSamGov(
      { pointOfContact: [{ email: 'a@b.com', phone: '555-0100' }] },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([{ reason: 'no_name', name: null }]);
  });

  it('falls back from fullName to name field', () => {
    const result = extractFromSamGov(
      { pointOfContact: [{ name: 'Aliased Field', email: 'a@b.com' }] },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].full_name).toBe('Aliased Field');
  });

  it('skips POC with no channel (no_channel)', () => {
    const result = extractFromSamGov(
      { pointOfContact: [{ fullName: 'Solo Name' }] },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([{ reason: 'no_channel', name: 'Solo Name' }]);
  });

  it('skips POC with malformed email (malformed_email) — even when phone exists', () => {
    const result = extractFromSamGov(
      {
        pointOfContact: [
          { fullName: 'Bad Email', email: 'not-an-email', phone: '555-0100' },
        ],
      },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([{ reason: 'malformed_email', name: 'Bad Email' }]);
  });

  it('keeps phone-only POC (no email field)', () => {
    const result = extractFromSamGov(
      { pointOfContact: [{ fullName: 'Phone Only', phone: '555-0100' }] },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].email).toBeNull();
    expect(result.contacts[0].phone).toBe('555-0100');
  });

  it('mixed POCs accumulate contacts and skipped separately', () => {
    const result = extractFromSamGov(
      {
        pointOfContact: [
          { fullName: 'Valid One', email: 'one@gov.com', phone: '555-0001' },
          { email: 'two@gov.com' }, // no name
          { fullName: 'No Channel' },
          { fullName: 'Bad Mail', email: 'broken@', phone: '555-0003' },
          { fullName: 'Valid Two', phone: '555-0004' },
        ],
      },
      TEST_PROJECT_ID,
    );
    expect(result.contacts.map((c) => c.full_name)).toEqual(['Valid One', 'Valid Two']);
    expect(result.skipped).toEqual([
      { reason: 'no_name', name: null },
      { reason: 'no_channel', name: 'No Channel' },
      { reason: 'malformed_email', name: 'Bad Mail' },
    ]);
  });

  it('ignores non-object entries in pointOfContact array', () => {
    const result = extractFromSamGov(
      {
        pointOfContact: [
          null,
          'a string',
          42,
          { fullName: 'Real Person', email: 'r@p.com' },
        ],
      },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].full_name).toBe('Real Person');
  });

  it('trims whitespace and treats whitespace-only as null', () => {
    const result = extractFromSamGov(
      {
        pointOfContact: [
          { fullName: '   ', email: 'a@b.com' },               // whitespace name → no_name
          { fullName: ' Trimmed ', email: ' a@b.com ' },       // both fields trimmed
        ],
      },
      TEST_PROJECT_ID,
    );
    expect(result.skipped).toEqual([{ reason: 'no_name', name: null }]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].full_name).toBe('Trimmed');
    expect(result.contacts[0].email).toBe('a@b.com');
  });
});

// ────────────────────────────────────────────────────────────────────────
// USAspending extractor
// ────────────────────────────────────────────────────────────────────────

describe('extractFromUSAspending', () => {
  it('returns empty for empty payload', () => {
    expect(extractFromUSAspending({}, TEST_PROJECT_ID)).toEqual({
      contacts: [],
      skipped: [],
    });
  });

  it('returns empty (no skip) when recipient_name is missing — no candidate to skip', () => {
    expect(
      extractFromUSAspending({ awarding_agency: {} }, TEST_PROJECT_ID),
    ).toEqual({ contacts: [], skipped: [] });
  });

  it('skips with no_channel for typical real payload (no contact channels)', () => {
    const result = extractFromUSAspending(usaspendingFixture, TEST_PROJECT_ID);
    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([
      { reason: 'no_channel', name: 'Acme Construction Corp' },
    ]);
  });

  it('extracts contact when recipient_phone is present', () => {
    const result = extractFromUSAspending(
      {
        recipient_name: 'Beta Builders LLC',
        recipient_phone: '555-0100',
      },
      TEST_PROJECT_ID,
    );
    expect(result.skipped).toEqual([]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({
      project_id: TEST_PROJECT_ID,
      contact_role: 'gc',
      full_name: 'Beta Builders LLC',
      email: null,
      phone: '555-0100',
      linkedin_url: null,
      company: 'Beta Builders LLC',
      title: null,
      source: 'raw_payload',
      confidence: USASPENDING_CONFIDENCE,
      inferred: false,
    });
  });

  it('extracts contact when recipient_email is present and valid', () => {
    const result = extractFromUSAspending(
      {
        recipient_name: 'Gamma Group',
        recipient_email: 'contracts@gamma.com',
      },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].email).toBe('contracts@gamma.com');
    expect(result.contacts[0].phone).toBeNull();
  });

  it('skips with malformed_email when recipient_email is invalid', () => {
    const result = extractFromUSAspending(
      {
        recipient_name: 'Delta Demolition',
        recipient_email: 'broken-email',
      },
      TEST_PROJECT_ID,
    );
    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([
      { reason: 'malformed_email', name: 'Delta Demolition' },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────

function fixtureProject(overrides: Partial<Project>): Project {
  return {
    id: TEST_PROJECT_ID,
    source: 'sam.gov',
    source_id: 'TEST-001',
    title: 'Test',
    summary: null,
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: null,
    rationale: null,
    rationale_streamed_at: null,
    score: null,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-29T00:00:00Z',
    ranked_at: null,
    ...overrides,
  };
}

describe('extractContacts dispatcher', () => {
  it('routes sam.gov to extractFromSamGov and stamps project_id', () => {
    const project = fixtureProject({
      id: 'P-sg-001',
      source: 'sam.gov',
      raw_payload: samGovFixture as unknown as Record<string, unknown>,
    });
    const result = extractContacts(project);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts.every((c) => c.project_id === 'P-sg-001')).toBe(true);
  });

  it('routes usaspending and stamps project_id (skipped path also stamps via extractor)', () => {
    const project = fixtureProject({
      id: 'P-usa-001',
      source: 'usaspending',
      raw_payload: {
        recipient_name: 'Routed Co',
        recipient_phone: '555-9999',
      },
    });
    const result = extractContacts(project);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].project_id).toBe('P-usa-001');
    expect(result.contacts[0].full_name).toBe('Routed Co');
  });

  it('accepts sam_gov as alias for sam.gov', () => {
    const project = fixtureProject({
      source: 'sam_gov',
      raw_payload: {
        pointOfContact: [{ fullName: 'Aliased', email: 'a@b.com' }],
      },
    });
    const result = extractContacts(project);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].full_name).toBe('Aliased');
  });

  it('source matching is case-insensitive', () => {
    const project = fixtureProject({
      source: 'SAM.GOV',
      raw_payload: { pointOfContact: [{ fullName: 'X', email: 'x@y.com' }] },
    });
    const result = extractContacts(project);
    expect(result.contacts).toHaveLength(1);
  });

  it('returns empty for unrecognised source', () => {
    const project = fixtureProject({
      source: 'news',
      raw_payload: { recipient_name: 'Ignored' },
    });
    expect(extractContacts(project)).toEqual({ contacts: [], skipped: [] });
  });

  it('returns empty for null raw_payload', () => {
    const project = fixtureProject({
      source: 'sam.gov',
      raw_payload: null,
    });
    expect(extractContacts(project)).toEqual({ contacts: [], skipped: [] });
  });
});
