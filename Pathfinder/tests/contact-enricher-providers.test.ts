// Unit tests for individual provider parsers + missing-cred behavior.
// Spec: SPEC - Contact Enrichment.md § Provider selection.
//
// We mock global fetch to avoid real network calls. Cred-missing path is
// exercised by clearing env vars; the provider classes accept an optional
// config in their constructors so tests can also pass null directly.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApolloContactEnricher,
  parseApolloResponse,
  readApolloConfig,
} from '@/services/contact-enricher/providers/apollo';
import {
  ClayContactEnricher,
  parseClayResponse,
  readClayConfig,
} from '@/services/contact-enricher/providers/clay';
import {
  HunterEmailVerifier,
  mapHunterStatus,
  readHunterConfig,
} from '@/services/contact-enricher/providers/hunter';
import type { EnrichRequest } from '@/services/contact-enricher/providers/types';

const SAMPLE_REQUEST: EnrichRequest = {
  project_id: 'sam.gov:TXDOT-I45-2026-001',
  owner_organization: 'Texas Department of Transportation',
  owner_type: 'state_agency',
  location_text: 'Houston, TX',
  naics_code: '237310',
  prioritized_roles: ['District Security Manager'],
  max_contacts: 5,
};

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  // Clear all provider-related env so tests start from a known baseline.
  delete process.env.CLAY_API_KEY;
  delete process.env.CLAY_WORKBOOK_ID;
  delete process.env.CLAY_API_BASE_URL;
  delete process.env.CLAY_COST_PER_RUN_USD;
  delete process.env.APOLLO_API_KEY;
  delete process.env.APOLLO_API_BASE_URL;
  delete process.env.APOLLO_COST_PER_RUN_USD;
  delete process.env.HUNTER_API_KEY;
  delete process.env.HUNTER_API_BASE_URL;
  delete process.env.HUNTER_COST_PER_VERIFY_USD;
});

describe('readClayConfig', () => {
  it('returns null when CLAY_API_KEY missing', () => {
    process.env.CLAY_WORKBOOK_ID = 'wb_123';
    expect(readClayConfig()).toBeNull();
  });
  it('returns null when CLAY_WORKBOOK_ID missing', () => {
    process.env.CLAY_API_KEY = 'k';
    expect(readClayConfig()).toBeNull();
  });
  it('returns config + applies COST override', () => {
    process.env.CLAY_API_KEY = 'k';
    process.env.CLAY_WORKBOOK_ID = 'wb_123';
    process.env.CLAY_COST_PER_RUN_USD = '0.10';
    const cfg = readClayConfig();
    expect(cfg?.apiKey).toBe('k');
    expect(cfg?.workbookId).toBe('wb_123');
    expect(cfg?.costPerRunUsd).toBe(0.1);
  });
});

describe('parseClayResponse', () => {
  it('parses a clean rows array', () => {
    const raw = {
      contacts: [
        {
          full_name: 'Jane Doe',
          title: 'District Security Manager',
          email: 'jane.doe@txdot.gov',
          email_status: 'verified',
          phone: '+1-512-555-0100',
          phone_type: 'direct',
          linkedin_url: 'https://linkedin.com/in/janedoe',
          confidence: 0.92,
        },
      ],
    };
    const out = parseClayResponse(raw, SAMPLE_REQUEST);
    expect(out.length).toBe(1);
    expect(out[0].contact_name).toBe('Jane Doe');
    expect(out[0].email_status).toBe('verified');
    expect(out[0].source).toBe('clay');
    expect(out[0].seniority).toBe('manager');
  });

  it('maps non-canonical email_status values', () => {
    const raw = {
      contacts: [{ full_name: 'A', email: 'a@x.com', email_status: 'deliverable' }],
    };
    expect(parseClayResponse(raw, SAMPLE_REQUEST)[0].email_status).toBe('verified');
  });

  it('returns [] for malformed payloads', () => {
    expect(parseClayResponse(null, SAMPLE_REQUEST)).toEqual([]);
    expect(parseClayResponse('not json', SAMPLE_REQUEST)).toEqual([]);
    expect(parseClayResponse({ wrong_key: [] }, SAMPLE_REQUEST)).toEqual([]);
  });

  it('skips rows without a name', () => {
    const raw = { contacts: [{ email: 'a@x.com' }, { full_name: '   ' }] };
    expect(parseClayResponse(raw, SAMPLE_REQUEST)).toEqual([]);
  });
});

describe('ClayContactEnricher (with mocked fetch)', () => {
  it('returns authoritative=false + cost=0 when no creds', async () => {
    const e = new ClayContactEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts).toEqual([]);
    expect(out.authoritative).toBe(false);
    expect(out.meta.cost_usd).toBe(0);
  });

  it('parses provider response on 200', async () => {
    process.env.CLAY_API_KEY = 'k';
    process.env.CLAY_WORKBOOK_ID = 'wb';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: 'req-001',
        contacts: [{ full_name: 'A', email: 'a@x.com' }],
      }),
    })) as unknown as typeof fetch;
    const e = new ClayContactEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts.length).toBe(1);
    expect(out.authoritative).toBe(true);
    expect(out.meta.cost_usd).toBeGreaterThan(0);
    expect(out.meta.raw_request_id).toBe('req-001');
  });

  it('marks authoritative=false on 4xx (credentials issue)', async () => {
    process.env.CLAY_API_KEY = 'k';
    process.env.CLAY_WORKBOOK_ID = 'wb';
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const e = new ClayContactEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts).toEqual([]);
    expect(out.authoritative).toBe(false);
  });

  it('marks authoritative=true on 5xx (transient server issue)', async () => {
    process.env.CLAY_API_KEY = 'k';
    process.env.CLAY_WORKBOOK_ID = 'wb';
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const e = new ClayContactEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts).toEqual([]);
    expect(out.authoritative).toBe(true);
  });
});

describe('parseApolloResponse', () => {
  it('parses people array and maps phone_numbers + email_status', () => {
    const raw = {
      people: [
        {
          first_name: 'Jane',
          last_name: 'Doe',
          title: 'VP Facilities',
          email: 'jane.doe@txdot.gov',
          email_status: 'verified',
          organization: { name: 'Texas DOT' },
          phone_numbers: [{ raw_number: '+1-512-555-0100', type: 'mobile' }],
          linkedin_url: 'https://linkedin.com/in/janedoe',
        },
      ],
    };
    const out = parseApolloResponse(raw, SAMPLE_REQUEST);
    expect(out.length).toBe(1);
    expect(out[0].contact_name).toBe('Jane Doe');
    expect(out[0].seniority).toBe('vp');
    expect(out[0].source).toBe('apollo');
    expect(out[0].phone_type).toBe('mobile');
    expect(out[0].email_status).toBe('verified');
  });

  it('handles missing email_status (apollo non-verified)', () => {
    const raw = {
      people: [{ name: 'Bob', email: 'bob@x.com', email_status: 'unverified' }],
    };
    expect(parseApolloResponse(raw, SAMPLE_REQUEST)[0].email_status).toBe('unknown');
  });

  it('returns [] on malformed payload', () => {
    expect(parseApolloResponse({}, SAMPLE_REQUEST)).toEqual([]);
    expect(parseApolloResponse(null, SAMPLE_REQUEST)).toEqual([]);
  });
});

describe('ApolloContactEnricher', () => {
  it('returns empty + non-authoritative when no creds', async () => {
    const e = new ApolloContactEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts).toEqual([]);
    expect(out.authoritative).toBe(false);
  });

  it('returns parsed contacts on 200', async () => {
    process.env.APOLLO_API_KEY = 'k';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        people: [{ name: 'X Y', title: 'Director of Facilities', email: 'x@y.com' }],
      }),
    })) as unknown as typeof fetch;
    const e = new ApolloContactEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts.length).toBe(1);
    expect(out.contacts[0].source).toBe('apollo');
  });
});

describe('HunterEmailVerifier', () => {
  it('returns unknown + cost=0 when no creds', async () => {
    const v = new HunterEmailVerifier();
    const out = await v.verifyEmail('a@x.com');
    expect(out.status).toBe('unknown');
    expect(out.cost_usd).toBe(0);
  });

  it('maps Hunter status taxonomy correctly', () => {
    expect(mapHunterStatus('valid')).toBe('verified');
    expect(mapHunterStatus('deliverable')).toBe('verified');
    expect(mapHunterStatus('invalid')).toBe('invalid');
    expect(mapHunterStatus('undeliverable')).toBe('invalid');
    expect(mapHunterStatus('accept_all')).toBe('unknown');
    expect(mapHunterStatus('webmail')).toBe('unknown');
    expect(mapHunterStatus(undefined)).toBe('unknown');
    expect(mapHunterStatus('weird')).toBe('unknown');
  });

  it('translates Hunter score 0..100 → confidence 0..1', async () => {
    process.env.HUNTER_API_KEY = 'k';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'valid', score: 92 } }),
    })) as unknown as typeof fetch;
    const v = new HunterEmailVerifier();
    const out = await v.verifyEmail('a@x.com');
    expect(out.status).toBe('verified');
    expect(out.confidence).toBeCloseTo(0.92, 5);
    expect(out.cost_usd).toBeGreaterThan(0);
  });

  it('returns unknown when fetch throws', async () => {
    process.env.HUNTER_API_KEY = 'k';
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const v = new HunterEmailVerifier();
    const out = await v.verifyEmail('a@x.com');
    expect(out.status).toBe('unknown');
    expect(out.cost_usd).toBe(0);
  });
});

describe('readApolloConfig / readHunterConfig env handling', () => {
  it('readApolloConfig null without key, set with key', () => {
    expect(readApolloConfig()).toBeNull();
    process.env.APOLLO_API_KEY = 'k';
    expect(readApolloConfig()?.apiKey).toBe('k');
  });
  it('readHunterConfig null without key, set with key', () => {
    expect(readHunterConfig()).toBeNull();
    process.env.HUNTER_API_KEY = 'k';
    expect(readHunterConfig()?.apiKey).toBe('k');
  });
});
