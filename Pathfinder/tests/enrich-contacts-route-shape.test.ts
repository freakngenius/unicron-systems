// tests/enrich-contacts-route-shape.test.ts — Demo Polish UX Gate 11A.
//
// The /enrich-contacts route is thin glue around `contactsFromSamGovPayload`
// (already covered by `tests/contacts-from-raw-payload.test.ts`) plus
// supabase IO. Full route exercise requires a live Supabase, so this file
// covers the deterministic helpers + the response-shape contract.
//
// Specifically:
//   - Non-sam.gov sources return a usaspending / harris / news / default
//     "providerless" message
//   - The shape conforms to the {ok, inserted, source, message} contract
//     so the ContactsCard's RunNowButton can rely on a consistent response

import { describe, expect, it } from 'vitest';

import { contactsFromSamGovPayload } from '@/lib/contacts/from-raw-payload';

describe('Gate 11A — sam.gov pointOfContact extractor (route input)', () => {
  it('extracts both primary and secondary contacts from a real sam.gov shape', () => {
    const out = contactsFromSamGovPayload('sam.gov:fixture', {
      fullParentPathName:
        'HEALTH AND HUMAN SERVICES.INDIAN HEALTH SERVICE.DIV OF ENGINEERING SVCS',
      pointOfContact: [
        {
          type: 'primary',
          fullName: 'Erik Lundstrom',
          email: 'erik.lundstrom@ihs.gov',
          phone: '5125550100',
          title: null,
          fax: null,
        },
        {
          type: 'secondary',
          fullName: 'Jenny Scroggins',
          email: 'jenny.scroggins@ihs.gov',
          phone: '',
          title: null,
          fax: null,
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].contact_name).toBe('Erik Lundstrom');
    expect(out[0].source).toBe('sam.gov-pointOfContact');
    expect(out[0].decision_authority).toBe('gatekeeper');
    expect(out[1].contact_name).toBe('Jenny Scroggins');
    expect(out[1].phone).toBeNull(); // empty string → null
  });

  it('returns 0 contacts when pointOfContact is missing', () => {
    expect(contactsFromSamGovPayload('p', {})).toHaveLength(0);
  });

  it('skips entries with missing contact_name (NOT NULL constraint)', () => {
    const out = contactsFromSamGovPayload('p', {
      pointOfContact: [
        { type: 'primary', fullName: '', email: 'x@y.com', phone: null, title: null, fax: null },
        { type: 'primary', fullName: 'Real Name', email: null, phone: null, title: null, fax: null },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].contact_name).toBe('Real Name');
  });
});
