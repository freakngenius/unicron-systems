// Unit tests for services/contact-enricher/agent.ts (Gate 8B).
// Spec: SPEC - Contact Enrichment.md § Enrichment logic + acceptance criteria.

import { describe, expect, it } from 'vitest';

import {
  PER_PROJECT_CONTACT_CAP,
  dedupeContacts,
  enrichOneLead,
  rankAndCap,
  shouldFallbackToApollo,
} from '@/services/contact-enricher/agent';
import type {
  ContactEnricher,
  EmailVerifier,
  EnrichRequest,
  EnrichResult,
  EnrichedContact,
} from '@/services/contact-enricher/providers/types';

function makeContact(over: Partial<EnrichedContact> = {}): EnrichedContact {
  return {
    project_id: 'sam.gov:TXDOT-I45-2026-001',
    owner_organization: 'Texas Department of Transportation',
    contact_name: 'Jane Doe',
    role: 'District Security Manager',
    seniority: 'manager',
    email: 'jane.doe@txdot.gov',
    email_status: 'guessed',
    phone: '+1-512-555-0100',
    phone_type: 'direct',
    linkedin_url: null,
    source: 'clay',
    source_confidence: 0.9,
    decision_authority: null,
    ...over,
  };
}

function clayResult(contacts: EnrichedContact[], authoritative = true): EnrichResult {
  return {
    contacts,
    meta: {
      provider: 'clay',
      cost_usd: contacts.length > 0 ? 0.05 : 0,
      latency_ms: 100,
      raw_request_id: 'stub-clay-001',
    },
    authoritative,
  };
}

function apolloResult(contacts: EnrichedContact[], authoritative = true): EnrichResult {
  return {
    contacts,
    meta: {
      provider: 'apollo',
      cost_usd: contacts.length > 0 ? 0.04 : 0,
      latency_ms: 200,
      raw_request_id: null,
    },
    authoritative,
  };
}

class StubClay implements ContactEnricher {
  readonly provider = 'clay' as const;
  constructor(private readonly result: EnrichResult) {}
  async enrichContacts(_req: EnrichRequest): Promise<EnrichResult> {
    return this.result;
  }
}

class StubApollo implements ContactEnricher {
  readonly provider = 'apollo' as const;
  public called = false;
  constructor(private readonly result: EnrichResult) {}
  async enrichContacts(_req: EnrichRequest): Promise<EnrichResult> {
    this.called = true;
    return this.result;
  }
}

class StubHunter implements EmailVerifier {
  readonly provider = 'hunter' as const;
  public calls: string[] = [];
  constructor(
    private readonly verdicts: Record<
      string,
      { status: 'verified' | 'invalid' | 'unknown'; confidence: number }
    > = {},
  ) {}
  async verifyEmail(email: string) {
    this.calls.push(email);
    const v = this.verdicts[email] ?? { status: 'unknown' as const, confidence: 0 };
    return { ...v, cost_usd: 0.01 };
  }
}

describe('shouldFallbackToApollo', () => {
  it('falls back when Clay returns < 3 contacts', () => {
    expect(shouldFallbackToApollo(clayResult([]))).toBe(true);
    expect(shouldFallbackToApollo(clayResult([makeContact()]))).toBe(true);
    expect(shouldFallbackToApollo(clayResult([makeContact(), makeContact({ contact_name: 'B' })]))).toBe(true);
  });

  it('does not fall back when Clay returns 3+ contacts with email/phone', () => {
    const three = [
      makeContact({ contact_name: 'A' }),
      makeContact({ contact_name: 'B' }),
      makeContact({ contact_name: 'C' }),
    ];
    expect(shouldFallbackToApollo(clayResult(three))).toBe(false);
  });

  it('falls back when Clay returns 3+ contacts but every one lacks both email and phone', () => {
    const three = [
      makeContact({ contact_name: 'A', email: null, phone: null }),
      makeContact({ contact_name: 'B', email: null, phone: null }),
      makeContact({ contact_name: 'C', email: null, phone: null }),
    ];
    expect(shouldFallbackToApollo(clayResult(three))).toBe(true);
  });

  it('does not fall back when at least one of 3+ contacts has phone', () => {
    const three = [
      makeContact({ contact_name: 'A', email: null, phone: '+15125550100' }),
      makeContact({ contact_name: 'B', email: null, phone: null }),
      makeContact({ contact_name: 'C', email: null, phone: null }),
    ];
    expect(shouldFallbackToApollo(clayResult(three))).toBe(false);
  });
});

describe('dedupeContacts', () => {
  it('keeps the verified-email row when name matches a guessed-email row', () => {
    const dup = [
      makeContact({ contact_name: 'Jane Doe', email: 'jane@txdot.gov', email_status: 'guessed', source: 'clay' }),
      makeContact({ contact_name: 'Jane Doe', email: 'jane@txdot.gov', email_status: 'verified', source: 'apollo' }),
    ];
    const out = dedupeContacts(dup);
    expect(out.length).toBe(1);
    expect(out[0].email_status).toBe('verified');
    expect(out[0].source).toBe('apollo');
  });

  it('keeps the higher source_confidence row when emails match', () => {
    const dup = [
      makeContact({ contact_name: 'Jane Doe', source_confidence: 0.6 }),
      makeContact({ contact_name: 'Jane Doe', source_confidence: 0.9 }),
    ];
    const out = dedupeContacts(dup);
    expect(out.length).toBe(1);
    expect(out[0].source_confidence).toBe(0.9);
  });

  it('keeps distinct contacts', () => {
    const out = dedupeContacts([
      makeContact({ contact_name: 'Jane Doe' }),
      makeContact({ contact_name: 'John Roe', email: 'john.roe@txdot.gov' }),
    ]);
    expect(out.length).toBe(2);
  });
});

describe('rankAndCap', () => {
  it('ranks signer > champion > influencer > gatekeeper > unknown', () => {
    const xs = [
      makeContact({ contact_name: 'GK', decision_authority: 'gatekeeper', seniority: 'manager' }),
      makeContact({ contact_name: 'CH', decision_authority: 'champion', seniority: 'manager' }),
      makeContact({ contact_name: 'SI', decision_authority: 'signer', seniority: 'vp' }),
      makeContact({ contact_name: 'IN', decision_authority: 'influencer', seniority: 'director' }),
      makeContact({ contact_name: 'UN', decision_authority: 'unknown', seniority: 'manager' }),
    ];
    const out = rankAndCap(xs);
    expect(out.map((c) => c.contact_name)).toEqual(['SI', 'CH', 'IN', 'GK', 'UN']);
  });

  it('breaks decision-authority ties by seniority then by email_status', () => {
    const xs = [
      makeContact({ contact_name: 'A', decision_authority: 'signer', seniority: 'director', email_status: 'guessed' }),
      makeContact({ contact_name: 'B', decision_authority: 'signer', seniority: 'vp', email_status: 'guessed' }),
      makeContact({ contact_name: 'C', decision_authority: 'signer', seniority: 'vp', email_status: 'verified' }),
    ];
    const out = rankAndCap(xs);
    expect(out.map((c) => c.contact_name)).toEqual(['C', 'B', 'A']);
  });

  it('caps at 5 by default; configurable', () => {
    const xs = Array.from({ length: 8 }).map((_, i) =>
      makeContact({ contact_name: `C${i}`, decision_authority: 'signer' }),
    );
    expect(rankAndCap(xs).length).toBe(PER_PROJECT_CONTACT_CAP);
    expect(rankAndCap(xs, 3).length).toBe(3);
  });
});

describe('enrichOneLead — skip rules', () => {
  it('skips when owner_name is null → owner_unknown', async () => {
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: null,
        owner_type: null,
      },
      {
        clay: new StubClay(clayResult([makeContact()])),
        apollo: new StubApollo(apolloResult([])),
        hunter: new StubHunter(),
      },
    );
    expect(out.status).toBe('skipped');
    expect(out.skip_reason).toBe('owner_unknown');
    expect(out.contacts).toEqual([]);
    expect(out.total_cost_usd).toBe(0);
  });

  it('skips when owner_name is "Pre-award (no awardee yet)" → pre_award', async () => {
    const out = await enrichOneLead({
      project_id: 'p1',
      owner_name: 'Pre-award (no awardee yet)',
      owner_type: 'federal_agency',
    });
    expect(out.status).toBe('skipped');
    expect(out.skip_reason).toBe('pre_award');
  });

  it('skips when rejection_reason is set → rejected', async () => {
    const out = await enrichOneLead({
      project_id: 'p1',
      owner_name: 'TxDOT',
      owner_type: 'state_agency',
      rejection_reason: 'duplicate',
    });
    expect(out.status).toBe('skipped');
    expect(out.skip_reason).toBe('rejected');
  });

  it('skips when nearest branch already serves the owner → cross_pollination_serves_owner', async () => {
    const out = await enrichOneLead({
      project_id: 'p1',
      owner_name: 'TxDOT',
      owner_type: 'state_agency',
      cross_pollination_serves_owner: true,
    });
    expect(out.status).toBe('skipped');
    expect(out.skip_reason).toBe('cross_pollination_serves_owner');
  });
});

describe('enrichOneLead — happy path (Clay returns 3+ verified)', () => {
  it('uses Clay only and does not call Apollo when Clay returns 3+ contacts with email/phone', async () => {
    const clay = new StubClay(
      clayResult([
        makeContact({ contact_name: 'A', role: 'VP Facilities' }),
        makeContact({ contact_name: 'B', role: 'Director of Construction' }),
        makeContact({ contact_name: 'C', role: 'Procurement Officer' }),
      ]),
    );
    const apollo = new StubApollo(apolloResult([]));
    const hunter = new StubHunter({
      'jane.doe@txdot.gov': { status: 'verified', confidence: 0.95 },
    });
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      { clay, apollo, hunter },
    );
    expect(out.status).toBe('enriched');
    expect(out.contacts.length).toBe(3);
    expect(apollo.called).toBe(false);
    // Hunter was called for the 3 guessed emails; one verdict in our map
    // verifies; the others come back unknown so stay 'guessed'.
    expect(hunter.calls.length).toBe(3);
    const verified = out.contacts.filter((c) => c.email_status === 'verified');
    expect(verified.length).toBeGreaterThanOrEqual(1);
    // Decision authority gets re-classified per role + owner_type.
    const vp = out.contacts.find((c) => c.role === 'VP Facilities');
    expect(vp?.decision_authority).toBe('signer');
    const procOfficer = out.contacts.find((c) => c.role === 'Procurement Officer');
    expect(procOfficer?.decision_authority).toBe('gatekeeper');
  });
});

describe('enrichOneLead — fallback path (Clay thin → Apollo)', () => {
  it('calls Apollo when Clay returns 1 contact, merges, and dedupes', async () => {
    const clay = new StubClay(clayResult([makeContact({ contact_name: 'Solo', email: null })]));
    const apollo = new StubApollo(
      apolloResult([
        makeContact({ contact_name: 'Solo', email: 'solo@txdot.gov', email_status: 'verified', source: 'apollo' }),
        makeContact({ contact_name: 'Bob B', role: 'Director of Construction', source: 'apollo' }),
      ]),
    );
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      { clay, apollo, hunter: new StubHunter() },
    );
    expect(apollo.called).toBe(true);
    expect(out.status).toBe('enriched');
    // Solo merged: Apollo's verified version wins.
    const solo = out.contacts.find((c) => c.contact_name === 'Solo');
    expect(solo?.email_status).toBe('verified');
    expect(solo?.source).toBe('apollo');
    // Two distinct contacts after dedupe.
    expect(out.contacts.length).toBe(2);
  });
});

describe('enrichOneLead — all-empty path', () => {
  it('marks status=empty when both providers authoritatively return 0 contacts', async () => {
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      {
        clay: new StubClay(clayResult([], true)),
        apollo: new StubApollo(apolloResult([], true)),
        hunter: new StubHunter(),
      },
    );
    expect(out.status).toBe('empty');
    expect(out.contacts).toEqual([]);
  });

  it('marks status=partial when both providers fail (auth, network)', async () => {
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      {
        clay: new StubClay(clayResult([], false)),
        apollo: new StubApollo(apolloResult([], false)),
        hunter: new StubHunter(),
      },
    );
    expect(out.status).toBe('partial');
  });
});

describe('enrichOneLead — email verification gate', () => {
  it('upgrades guessed → verified, downgrades guessed → invalid, leaves guessed when unknown', async () => {
    const clay = new StubClay(
      clayResult([
        makeContact({ contact_name: 'Verified', email: 'v@txdot.gov', email_status: 'guessed' }),
        makeContact({ contact_name: 'Bad', email: 'bad@txdot.gov', email_status: 'guessed' }),
        makeContact({ contact_name: 'Catchall', email: 'c@txdot.gov', email_status: 'guessed' }),
      ]),
    );
    const hunter = new StubHunter({
      'v@txdot.gov': { status: 'verified', confidence: 0.95 },
      'bad@txdot.gov': { status: 'invalid', confidence: 0.05 },
      'c@txdot.gov': { status: 'unknown', confidence: 0.5 },
    });
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      {
        clay,
        apollo: new StubApollo(apolloResult([])),
        hunter,
      },
    );
    const byName = Object.fromEntries(out.contacts.map((c) => [c.contact_name, c]));
    expect(byName.Verified.email_status).toBe('verified');
    expect(byName.Bad.email_status).toBe('invalid');
    expect(byName.Catchall.email_status).toBe('guessed');
    expect(out.meta.hunter_calls).toBe(3);
    expect(out.meta.hunter_verified).toBe(1);
    expect(out.meta.hunter_invalidated).toBe(1);
  });

  it('does not call hunter for already-verified or invalid emails', async () => {
    const hunter = new StubHunter();
    const clay = new StubClay(
      clayResult([
        makeContact({ contact_name: 'A', email: 'a@x.com', email_status: 'verified' }),
        makeContact({ contact_name: 'B', email: 'b@x.com', email_status: 'invalid' }),
        makeContact({ contact_name: 'C', email: 'c@x.com', email_status: 'guessed' }),
        makeContact({ contact_name: 'D', email: null }),
      ]),
    );
    await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      { clay, apollo: new StubApollo(apolloResult([])), hunter },
    );
    expect(hunter.calls).toEqual(['c@x.com']);
  });
});

describe('enrichOneLead — 5-contact cap', () => {
  it('caps the persisted set at 5 even when providers return more', async () => {
    const tenContacts = Array.from({ length: 10 }).map((_, i) =>
      makeContact({
        contact_name: `Person ${i}`,
        email: `p${i}@txdot.gov`,
        role: i < 3 ? 'VP Facilities' : 'Project Manager',
      }),
    );
    const clay = new StubClay(clayResult(tenContacts));
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      { clay, apollo: new StubApollo(apolloResult([])), hunter: new StubHunter() },
    );
    expect(out.contacts.length).toBe(PER_PROJECT_CONTACT_CAP);
    // Top 3 should be the VP Facilities ones (signer rank).
    const topThree = out.contacts.slice(0, 3);
    expect(topThree.every((c) => c.role === 'VP Facilities')).toBe(true);
  });
});

describe('enrichOneLead — cost telemetry rolls up', () => {
  it('sums clay + apollo + hunter cost into total_cost_usd', async () => {
    const clay = new StubClay(clayResult([makeContact({ contact_name: 'A' })]));
    const apollo = new StubApollo(apolloResult([makeContact({ contact_name: 'B', source: 'apollo' })]));
    const hunter = new StubHunter({
      'jane.doe@txdot.gov': { status: 'verified', confidence: 0.95 },
    });
    const out = await enrichOneLead(
      {
        project_id: 'p1',
        owner_name: 'TxDOT',
        owner_type: 'state_agency',
      },
      { clay, apollo, hunter },
    );
    // 0.05 (clay) + 0.04 (apollo) + 2 hunter calls * 0.01.
    expect(out.total_cost_usd).toBeCloseTo(0.05 + 0.04 + 0.02, 5);
  });
});
