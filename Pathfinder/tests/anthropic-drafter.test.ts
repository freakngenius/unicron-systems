// tests/anthropic-drafter.test.ts — Demo Polish UX Gate 9C.
//
// Pure tests for the v2 outreach drafter — prompt building + JSON
// response parsing. The full Anthropic round-trip is covered by an
// integration smoke during Gate 9E.

import { describe, expect, it } from 'vitest';

import {
  buildV2DrafterUserPrompt,
  parseV2DraftResponse,
} from '@/lib/outreach/anthropic-drafter';

describe('buildV2DrafterUserPrompt', () => {
  it('embeds title, value, distance, branch, posted, and rationale', () => {
    const prompt = buildV2DrafterUserPrompt({
      project: {
        id: 'sam.gov:TXDOT-I45-2026-001',
        title: 'TxDOT I-45 Corridor',
        rationale: 'Strong fit. Verified. Worth a 30-minute call this week.',
        project_value: 4_200_000,
        distance_miles: 8.5,
        posted_date: '2026-04-21T00:00:00Z',
      },
      branch: { name: 'Houston', state: 'TX' },
      contact: {
        name: 'Jane Doe',
        role: 'District Security Manager',
        email: 'jane.doe@txdot.gov',
      },
      warmIntroCustomer: null,
    });
    expect(prompt).toContain('TxDOT I-45 Corridor');
    expect(prompt).toContain('$4,200,000');
    expect(prompt).toContain('8.5 mi');
    expect(prompt).toContain('Houston');
    expect(prompt).toContain('TX');
    expect(prompt).toContain('Jane Doe');
    expect(prompt).toContain('jane.doe@txdot.gov');
    expect(prompt).toContain('District Security Manager');
    expect(prompt).toContain('Strong fit. Verified.');
  });

  it('emits a generic recipient line when no contact is supplied', () => {
    const prompt = buildV2DrafterUserPrompt({
      project: {
        id: 'p',
        title: 't',
        rationale: null,
        project_value: null,
        distance_miles: null,
        posted_date: null,
      },
      branch: null,
      contact: null,
      warmIntroCustomer: null,
    });
    expect(prompt).toContain('RECIPIENT: not specified');
  });

  it('embeds the warm-intro customer when present', () => {
    const prompt = buildV2DrafterUserPrompt({
      project: {
        id: 'p',
        title: 't',
        rationale: null,
        project_value: null,
        distance_miles: null,
        posted_date: null,
      },
      branch: null,
      contact: null,
      warmIntroCustomer: 'Brasfield & Gorrie',
    });
    expect(prompt).toContain('WARM-INTRO CUSTOMER: Brasfield & Gorrie');
  });

  it('omits null project fields cleanly', () => {
    const prompt = buildV2DrafterUserPrompt({
      project: {
        id: 'p',
        title: 't',
        rationale: null,
        project_value: null,
        distance_miles: null,
        posted_date: null,
      },
      branch: null,
      contact: null,
      warmIntroCustomer: null,
    });
    expect(prompt).not.toContain('PROJECT VALUE:');
    expect(prompt).not.toContain('DISTANCE TO NEAREST');
    expect(prompt).not.toContain('POSTED:');
    expect(prompt).not.toContain('NEAREST ZEDCOR BRANCH:');
  });
});

describe('parseV2DraftResponse — happy path', () => {
  it('parses a clean JSON object with all keys', () => {
    const raw = JSON.stringify({
      subject: '20-min call on Houston I-45 perimeter security?',
      body: 'TxDOT I-45 Corridor is starting site clearing in May. Zedcor Houston runs 30+ towers within 8 miles of the staging yards. Two slots open Tuesday and Thursday this week.',
      suggested_recipient_email: 'jane.doe@txdot.gov',
    });
    const out = parseV2DraftResponse(raw);
    expect(out.subject).toBe('20-min call on Houston I-45 perimeter security?');
    expect(out.body).toContain('TxDOT I-45 Corridor');
    expect(out.suggested_recipient_email).toBe('jane.doe@txdot.gov');
  });

  it('strips a ```json fence', () => {
    const raw =
      '```json\n{\n  "subject": "S",\n  "body": "B",\n  "suggested_recipient_email": "x@y.com"\n}\n```';
    const out = parseV2DraftResponse(raw);
    expect(out.subject).toBe('S');
    expect(out.body).toBe('B');
  });

  it('extracts the first {...} blob when LLM appends trailing prose', () => {
    const raw =
      '{"subject":"S","body":"B","suggested_recipient_email":null}\n\nNote: keep concise.';
    const out = parseV2DraftResponse(raw);
    expect(out.subject).toBe('S');
    expect(out.suggested_recipient_email).toBeNull();
  });

  it('returns null suggested_recipient_email when the field is empty string', () => {
    const raw = JSON.stringify({
      subject: 'S',
      body: 'B',
      suggested_recipient_email: '   ',
    });
    expect(parseV2DraftResponse(raw).suggested_recipient_email).toBeNull();
  });
});

describe('parseV2DraftResponse — failure paths', () => {
  it('throws on non-JSON content', () => {
    expect(() => parseV2DraftResponse('not json at all')).toThrow();
  });

  it('throws on missing subject', () => {
    const raw = JSON.stringify({ body: 'B', suggested_recipient_email: null });
    expect(() => parseV2DraftResponse(raw)).toThrow(/empty subject/);
  });

  it('throws on missing body', () => {
    const raw = JSON.stringify({ subject: 'S', suggested_recipient_email: null });
    expect(() => parseV2DraftResponse(raw)).toThrow(/empty body/);
  });

  it('throws when subject exceeds 80 chars', () => {
    const raw = JSON.stringify({
      subject: 'x'.repeat(81),
      body: 'B',
      suggested_recipient_email: null,
    });
    expect(() => parseV2DraftResponse(raw)).toThrow(/subject exceeded 80/);
  });

  it('throws when body exceeds 300 words', () => {
    const body = Array.from({ length: 301 }, (_, i) => `w${i}`).join(' ');
    const raw = JSON.stringify({
      subject: 'S',
      body,
      suggested_recipient_email: null,
    });
    expect(() => parseV2DraftResponse(raw)).toThrow(/body exceeded 300/);
  });
});
