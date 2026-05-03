// Unit tests for lib/contacts/from-raw-payload.ts (Gate 8X-1).
//
// Test fixtures mirror real shapes seen in production
// (sam.gov:f7d3ab66f8a64407837cd92fd7b34973 — USCG Articulating Boom Lift,
// sam.gov:ec3dfc7a63654960bc13915f1e8b9a25 — Army Closed Circuit Wind Tunnel,
// sam.gov:f1b8b1bcc6484e918c03707974663953 — Whiteriver Hospital).

import { describe, expect, it } from 'vitest';

import {
  contactsFromSamGovPayload,
  ownerOrgFromAgencyPath,
  type SamGovRawPayload,
} from '@/lib/contacts/from-raw-payload';

describe('ownerOrgFromAgencyPath', () => {
  it('returns the leaf segment of a dotted agency hierarchy', () => {
    expect(
      ownerOrgFromAgencyPath(
        'HEALTH AND HUMAN SERVICES, DEPARTMENT OF.INDIAN HEALTH SERVICE.DIV OF ENGINEERING SVCS - SEATTLE',
      ),
    ).toBe('DIV OF ENGINEERING SVCS - SEATTLE');
  });

  it('handles a single-segment string (no dots)', () => {
    expect(ownerOrgFromAgencyPath('GENERAL SERVICES ADMIN')).toBe('GENERAL SERVICES ADMIN');
  });

  it('returns a stable fallback for null / empty / whitespace', () => {
    expect(ownerOrgFromAgencyPath(null)).toBe('Unknown federal office');
    expect(ownerOrgFromAgencyPath('')).toBe('Unknown federal office');
    expect(ownerOrgFromAgencyPath('   ')).toBe('Unknown federal office');
    expect(ownerOrgFromAgencyPath(undefined)).toBe('Unknown federal office');
  });

  it('trims whitespace within segments', () => {
    expect(ownerOrgFromAgencyPath('A.B. C ')).toBe('C');
  });
});

describe('contactsFromSamGovPayload — happy path', () => {
  it('extracts primary + secondary contracting officers (Whiteriver shape)', () => {
    const payload: SamGovRawPayload = {
      pointOfContact: [
        {
          fax: '',
          type: 'primary',
          email: 'wanda.k.little.civ@army.mil',
          phone: '5715889776',
          title: null,
          fullName: 'Wanda Little',
        },
        {
          fax: '',
          type: 'secondary',
          email: 'portia.r.sampson.civ@army.mil',
          phone: '520-674-8299',
          title: null,
          fullName: 'Portia Sampson',
        },
      ],
      fullParentPathName:
        'DEPT OF DEFENSE.DEPT OF THE ARMY.AMC.ACC.ACC-CTRS.ACC RSA.W6QK ACC-RSA',
    };
    const out = contactsFromSamGovPayload('sam.gov:closed-circuit-wt', payload);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({
      project_id: 'sam.gov:closed-circuit-wt',
      owner_organization: 'W6QK ACC-RSA',
      contact_name: 'Wanda Little',
      role: 'Contracting Officer',
      seniority: 'manager',
      email: 'wanda.k.little.civ@army.mil',
      email_status: 'verified',
      phone: '5715889776',
      phone_type: 'direct',
      source: 'sam.gov-pointOfContact',
      source_confidence: 1.0,
      decision_authority: 'gatekeeper',
    });
    expect(out[1]).toMatchObject({
      contact_name: 'Portia Sampson',
      role: 'Contract Specialist',
    });
    expect(out[1].notes).toContain('secondary');
    expect(out[0].notes).toContain('primary');
  });
});

describe('contactsFromSamGovPayload — edge cases', () => {
  it('returns [] when pointOfContact is missing', () => {
    expect(contactsFromSamGovPayload('p1', { pointOfContact: undefined })).toEqual([]);
  });

  it('returns [] when pointOfContact is a scalar (not an array)', () => {
    expect(
      contactsFromSamGovPayload('p1', {
        pointOfContact: { type: 'primary' } as unknown as never,
      }),
    ).toEqual([]);
  });

  it('returns [] when pointOfContact is an empty array', () => {
    expect(contactsFromSamGovPayload('p1', { pointOfContact: [] })).toEqual([]);
  });

  it('skips entries without fullName (contact_name is NOT NULL)', () => {
    const out = contactsFromSamGovPayload('p1', {
      pointOfContact: [
        { type: 'primary', fullName: null, email: 'a@x.gov' },
        { type: 'secondary', fullName: '   ' },
        { type: 'primary', fullName: 'Real Person', email: 'real@x.gov' },
      ],
    });
    expect(out.length).toBe(1);
    expect(out[0].contact_name).toBe('Real Person');
  });

  it('treats empty-string email/phone as null (no false-positive verified)', () => {
    const out = contactsFromSamGovPayload('p1', {
      pointOfContact: [
        { type: 'primary', fullName: 'Phoneless', email: 'a@x.gov', phone: '' },
        { type: 'primary', fullName: 'Emailless', email: '', phone: '555-0100' },
      ],
    });
    expect(out[0].phone).toBeNull();
    expect(out[0].phone_type).toBeNull();
    expect(out[0].email_status).toBe('verified'); // email exists
    expect(out[1].email).toBeNull();
    expect(out[1].email_status).toBeNull();
    expect(out[1].phone_type).toBe('direct');
  });

  it('uses explicit title when provided, else falls back by type', () => {
    const out = contactsFromSamGovPayload('p1', {
      pointOfContact: [
        { type: 'primary', fullName: 'A', title: 'Procurement Officer' },
        { type: 'secondary', fullName: 'B', title: null },
        { type: 'primary', fullName: 'C', title: '' }, // empty trims to fallback
        // unknown / missing type defaults to primary fallback
        { type: undefined as unknown as never, fullName: 'D' },
      ],
    });
    expect(out[0].role).toBe('Procurement Officer');
    expect(out[1].role).toBe('Contract Specialist');
    expect(out[2].role).toBe('Contracting Officer');
    expect(out[3].role).toBe('Contracting Officer');
  });

  it('uses Unknown federal office when fullParentPathName is missing', () => {
    const out = contactsFromSamGovPayload('p1', {
      pointOfContact: [{ type: 'primary', fullName: 'A' }],
      fullParentPathName: null,
    });
    expect(out[0].owner_organization).toBe('Unknown federal office');
  });

  it('marks every contact gatekeeper + manager regardless of input', () => {
    const out = contactsFromSamGovPayload('p1', {
      pointOfContact: [
        { type: 'primary', fullName: 'Alice' },
        { type: 'secondary', fullName: 'Bob' },
      ],
    });
    expect(out.every((c) => c.decision_authority === 'gatekeeper')).toBe(true);
    expect(out.every((c) => c.seniority === 'manager')).toBe(true);
    expect(out.every((c) => c.source_confidence === 1.0)).toBe(true);
    expect(out.every((c) => c.source === 'sam.gov-pointOfContact')).toBe(true);
  });
});
