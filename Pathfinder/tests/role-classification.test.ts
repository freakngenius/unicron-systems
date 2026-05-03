// Unit tests for lib/contacts/role-classification.ts (Gate 8A).
// Spec: Company Docs/Specs/SPEC - Contact Enrichment.md § Decision authority
// inference + § Enrichment logic.

import { describe, expect, it } from 'vitest';

import {
  classifyDecisionAuthority,
  classifySeniority,
  priorityRolesForOwnerType,
} from '@/lib/contacts/role-classification';

describe('classifySeniority', () => {
  it('classifies c_suite from CEO / CFO / President / Owner', () => {
    expect(classifySeniority('CEO')).toBe('c_suite');
    expect(classifySeniority('Chief Financial Officer')).toBe('c_suite');
    expect(classifySeniority('President of Operations')).toBe('c_suite');
    expect(classifySeniority('Owner / Founder')).toBe('c_suite');
  });

  it('classifies vp from VP / SVP / EVP / AVP / Vice President', () => {
    expect(classifySeniority('VP Facilities')).toBe('vp');
    expect(classifySeniority('SVP Construction')).toBe('vp');
    expect(classifySeniority('Vice President, Real Estate')).toBe('vp');
    expect(classifySeniority('AVP Facilities')).toBe('vp');
  });

  it('classifies director from Director / Head of', () => {
    expect(classifySeniority('Director of Public Safety')).toBe('director');
    expect(classifySeniority('Head of Security')).toBe('director');
    expect(classifySeniority('Director, Capital Projects')).toBe('director');
  });

  it('classifies manager from Manager / Officer / Supervisor', () => {
    expect(classifySeniority('Procurement Officer')).toBe('manager');
    expect(classifySeniority('Construction Manager')).toBe('manager');
    expect(classifySeniority('Site Supervisor')).toBe('manager');
  });

  it('classifies individual_contributor from engineer / analyst / coordinator', () => {
    expect(classifySeniority('Project Engineer')).toBe('individual_contributor');
    expect(classifySeniority('Procurement Analyst')).toBe('individual_contributor');
    expect(classifySeniority('Construction Coordinator')).toBe('individual_contributor');
  });

  it('returns unknown for null / empty / unrecognized', () => {
    expect(classifySeniority(null)).toBe('unknown');
    expect(classifySeniority('')).toBe('unknown');
    expect(classifySeniority('Some Random Role')).toBe('unknown');
  });
});

describe('classifyDecisionAuthority', () => {
  it('classifies champion for security / loss prevention / risk / public safety', () => {
    expect(classifyDecisionAuthority({ role: 'Director of Security' })).toBe('champion');
    expect(classifyDecisionAuthority({ role: 'Loss Prevention Manager' })).toBe('champion');
    expect(classifyDecisionAuthority({ role: 'Risk Manager' })).toBe('champion');
    expect(classifyDecisionAuthority({ role: 'Director of Public Safety' })).toBe('champion');
    // Critical demo case — TxDOT district security manager.
    expect(
      classifyDecisionAuthority({
        role: 'District Security Manager',
        owner_type: 'state_agency',
      }),
    ).toBe('champion');
  });

  it('classifies gatekeeper for procurement / buyer / EA / chief of staff', () => {
    expect(classifyDecisionAuthority({ role: 'Procurement Officer' })).toBe('gatekeeper');
    expect(classifyDecisionAuthority({ role: 'Senior Buyer' })).toBe('gatekeeper');
    expect(classifyDecisionAuthority({ role: 'Executive Assistant to CEO' })).toBe('gatekeeper');
    expect(classifyDecisionAuthority({ role: 'Chief of Staff' })).toBe('gatekeeper');
    expect(classifyDecisionAuthority({ role: 'Contracting Officer' })).toBe('gatekeeper');
  });

  it('classifies signer for VP+ in facilities / construction / ops / real estate', () => {
    expect(classifyDecisionAuthority({ role: 'VP Facilities' })).toBe('signer');
    expect(classifyDecisionAuthority({ role: 'SVP Construction' })).toBe('signer');
    expect(classifyDecisionAuthority({ role: 'EVP, Real Estate' })).toBe('signer');
    expect(classifyDecisionAuthority({ role: 'Chief Operations Officer' })).toBe('signer');
  });

  it('classifies signer for Public Works Director and Capital Projects Director regardless', () => {
    expect(classifyDecisionAuthority({ role: 'Public Works Director' })).toBe('signer');
    expect(classifyDecisionAuthority({ role: 'Capital Projects Director' })).toBe('signer');
  });

  it('classifies CFO as signer when project_value > $5M, influencer otherwise', () => {
    expect(
      classifyDecisionAuthority({ role: 'CFO', project_value_usd: 6_000_000 }),
    ).toBe('signer');
    expect(
      classifyDecisionAuthority({ role: 'CFO', project_value_usd: 4_000_000 }),
    ).toBe('influencer');
    // Null value → fall through to influencer.
    expect(classifyDecisionAuthority({ role: 'Chief Financial Officer' })).toBe('influencer');
  });

  it('classifies influencer for Director-level in core domains and PM / CM / Owner Rep', () => {
    expect(classifyDecisionAuthority({ role: 'Director of Construction' })).toBe('influencer');
    expect(classifyDecisionAuthority({ role: 'Director of Facilities' })).toBe('influencer');
    expect(classifyDecisionAuthority({ role: 'Project Manager' })).toBe('influencer');
    expect(classifyDecisionAuthority({ role: 'Construction Manager' })).toBe('influencer');
    expect(classifyDecisionAuthority({ role: "Owner's Rep" })).toBe('influencer');
    expect(classifyDecisionAuthority({ role: 'Project Executive' })).toBe('influencer');
  });

  it('returns unknown for empty / unrelated roles', () => {
    expect(classifyDecisionAuthority({ role: null })).toBe('unknown');
    expect(classifyDecisionAuthority({ role: '' })).toBe('unknown');
    expect(classifyDecisionAuthority({ role: 'HR Generalist' })).toBe('unknown');
    expect(classifyDecisionAuthority({ role: 'Marketing Coordinator' })).toBe('unknown');
  });

  it('champion check fires before influencer for security director', () => {
    // Director of Security would otherwise classify as influencer (director +
    // not in facilities/construction/ops/real-estate domain), but the
    // champion path runs first.
    expect(classifyDecisionAuthority({ role: 'Director of Security' })).toBe('champion');
  });
});

describe('priorityRolesForOwnerType', () => {
  // The 5 owner-type role mappings from the spec — required coverage per
  // the Gate 8A acceptance line "cover all 5 owner-type role mappings".
  it('federal_agency / state_agency / municipality share the public-sector list', () => {
    const fed = priorityRolesForOwnerType('federal_agency');
    const state = priorityRolesForOwnerType('state_agency');
    const muni = priorityRolesForOwnerType('municipality');
    expect(fed).toContain('District Security Manager');
    expect(fed).toContain('Public Works Director');
    expect(fed).toContain('Procurement Officer');
    expect(state).toEqual(fed);
    expect(muni).toEqual(fed);
  });

  it('pe_firm / reit share the corporate list', () => {
    const pe = priorityRolesForOwnerType('pe_firm');
    const reit = priorityRolesForOwnerType('reit');
    expect(pe).toContain('VP Facilities');
    expect(pe).toContain('Director of Real Estate');
    expect(pe).toContain('Asset Manager');
    expect(reit).toEqual(pe);
  });

  it('university surfaces public safety + capital projects + AVP facilities', () => {
    const uni = priorityRolesForOwnerType('university');
    expect(uni).toContain('Director of Public Safety');
    expect(uni).toContain('AVP Facilities');
    expect(uni).toContain('Capital Projects Director');
  });

  it('private_developer surfaces project executive + construction manager + owner rep', () => {
    const dev = priorityRolesForOwnerType('private_developer');
    expect(dev).toContain('Project Executive');
    expect(dev).toContain('Construction Manager');
    expect(dev).toContain("Owner's Rep");
  });

  it('falls back to a useful generalist list for unknown / other / nonprofit / null', () => {
    const generalist = priorityRolesForOwnerType('other');
    expect(priorityRolesForOwnerType('nonprofit')).toEqual(generalist);
    expect(priorityRolesForOwnerType(null)).toEqual(generalist);
    expect(priorityRolesForOwnerType(undefined)).toEqual(generalist);
    expect(priorityRolesForOwnerType('not-a-known-type')).toEqual(generalist);
    expect(generalist).toContain('VP Facilities');
    expect(generalist).toContain('Director of Construction');
  });
});
