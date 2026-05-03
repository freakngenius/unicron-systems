// Unit tests for services/contact-enricher/providers/types.ts (Gate 8A).
//
// The interface itself is purely structural. These tests pin the contract
// down at runtime by constructing minimal-shape values and a stub provider,
// so that future changes to the interface (Gate 8B's Clay / Apollo / Hunter
// implementations, a 4th provider, etc.) trip CI if the contract drifts.

import { describe, expect, it } from 'vitest';

import type {
  ContactEnricher,
  EmailVerifier,
  EnrichRequest,
  EnrichResult,
  EnrichedContact,
} from '@/services/contact-enricher/providers/types';

const SAMPLE_REQUEST: EnrichRequest = {
  project_id: 'sam.gov:TXDOT-I45-2026-001',
  owner_organization: 'Texas Department of Transportation',
  owner_type: 'state_agency',
  location_text: 'Houston, TX',
  naics_code: '237310',
  prioritized_roles: ['District Security Manager', 'Public Works Director'],
  max_contacts: 5,
};

const SAMPLE_CONTACT: EnrichedContact = {
  project_id: SAMPLE_REQUEST.project_id,
  owner_organization: SAMPLE_REQUEST.owner_organization,
  contact_name: 'Jane Doe',
  role: 'District Security Manager',
  seniority: 'manager',
  email: 'jane.doe@txdot.gov',
  email_status: 'verified',
  phone: '+1-512-555-0100',
  phone_type: 'direct',
  linkedin_url: 'https://linkedin.com/in/jane-doe-txdot',
  source: 'clay',
  source_confidence: 0.92,
  decision_authority: 'champion',
};

class StubEnricher implements ContactEnricher {
  readonly provider = 'clay' as const;
  async enrichContacts(req: EnrichRequest): Promise<EnrichResult> {
    return {
      contacts: req.max_contacts === 0 ? [] : [SAMPLE_CONTACT],
      meta: {
        provider: this.provider,
        cost_usd: 0.05,
        latency_ms: 1234,
        raw_request_id: 'stub-req-001',
      },
      authoritative: true,
    };
  }
}

class StubVerifier implements EmailVerifier {
  readonly provider = 'hunter' as const;
  async verifyEmail(email: string) {
    return {
      status: email.includes('@') ? ('verified' as const) : ('invalid' as const),
      confidence: email.includes('@') ? 0.95 : 0.0,
      cost_usd: 0.001,
    };
  }
}

describe('ContactEnricher interface contract', () => {
  it('produces a result whose contacts conform to EnrichedContact', async () => {
    const e = new StubEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.contacts.length).toBe(1);
    const c = out.contacts[0];
    expect(c.project_id).toBe(SAMPLE_REQUEST.project_id);
    expect(c.contact_name).toBe('Jane Doe');
    expect(c.email_status).toBe('verified');
    expect(c.decision_authority).toBe('champion');
    expect(c.source).toBe('clay');
  });

  it('exposes provider name + cost + latency in meta', async () => {
    const e = new StubEnricher();
    const out = await e.enrichContacts(SAMPLE_REQUEST);
    expect(out.meta.provider).toBe('clay');
    expect(out.meta.cost_usd).toBeGreaterThan(0);
    expect(out.meta.latency_ms).toBeGreaterThan(0);
    expect(out.authoritative).toBe(true);
  });

  it('returns empty contacts when max_contacts=0', async () => {
    const e = new StubEnricher();
    const out = await e.enrichContacts({ ...SAMPLE_REQUEST, max_contacts: 0 });
    expect(out.contacts).toEqual([]);
  });
});

describe('EmailVerifier interface contract', () => {
  it('verified for well-formed email, invalid for garbage', async () => {
    const v = new StubVerifier();
    const ok = await v.verifyEmail('a@b.com');
    expect(ok.status).toBe('verified');
    expect(ok.confidence).toBeGreaterThan(0.5);
    const bad = await v.verifyEmail('not-an-email');
    expect(bad.status).toBe('invalid');
    expect(bad.confidence).toBe(0);
  });
});
