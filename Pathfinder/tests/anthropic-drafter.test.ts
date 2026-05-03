// tests/anthropic-drafter.test.ts — Demo Polish UX Gate 9C, expanded
// in Gate 12D for the FROM/TO prompt rewrite.
//
// Pure tests for the v2 outreach drafter — system prompt structure,
// user-prompt builder, response parser, and the new sender-first-name
// helper. The full Anthropic round-trip is covered by an integration
// smoke during Gate 9E / post-deploy verification.

import { describe, expect, it } from 'vitest';

import {
  buildV2DrafterUserPrompt,
  parseV2DraftResponse,
  senderFirstNameFromEmail,
  V2_DRAFTER_SYSTEM_PROMPT,
  type V2DraftContext,
} from '@/lib/outreach/anthropic-drafter';

const txdotCtx: V2DraftContext = {
  project: {
    id: 'sam.gov:TXDOT-I45-2026-001',
    title: 'TxDOT I-45 Corridor',
    rationale: 'Strong fit. Verified. Worth a 30-minute call this week.',
    project_value: 4_200_000,
    distance_miles: 8.5,
    posted_date: '2026-04-21T00:00:00Z',
    deadline: '2026-05-13',
    naics: '561612 (Security Guards and Patrol Services)',
  },
  branch: { name: 'Houston', state: 'TX' },
  contact: {
    name: 'Erik Soto',
    role: 'District Security Manager',
    organization: 'TxDOT',
    email: 'erik.soto@txdot.gov',
  },
  warmIntroCustomer: null,
  sender: { firstName: 'Kyle', email: 'kyle@freakngenius.com', provider: 'gmail' },
};

describe('V2_DRAFTER_SYSTEM_PROMPT — Gate 12D structure', () => {
  it('frames the email FROM a Zedcor account executive TO the decision-maker', () => {
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain(
      'FROM a Zedcor account executive',
    );
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain(
      'TO the named decision-maker',
    );
    expect(V2_DRAFTER_SYSTEM_PROMPT).toMatch(/15-30 minute call/);
  });

  it('includes the explicit ban list (wellness opener, em-dashes, buzzwords, lists)', () => {
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('I hope this finds you well');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('Em-dashes');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('Synergy');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('leverage');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('circle back');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('touch base');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('Bulleted lists');
  });

  it('caps the body at 250 words and 4 paragraphs and the subject at 80 chars', () => {
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('250 words');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('4 paragraphs');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('subject <=80 chars');
  });

  it('asks for the JSON contract { subject, body, suggested_recipient_email }', () => {
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('"subject"');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('"body"');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('"suggested_recipient_email"');
  });

  it('directs the sign-off to derive sender first name from the connected account', () => {
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('Sender first name');
    expect(V2_DRAFTER_SYSTEM_PROMPT).toContain('connected email account');
  });
});

describe('senderFirstNameFromEmail', () => {
  it('parses a dotted local-part and capitalises the first token', () => {
    expect(senderFirstNameFromEmail('jane.doe@txdot.gov')).toBe('Jane');
  });

  it('handles underscore, hyphen, and plus-tag separators', () => {
    expect(senderFirstNameFromEmail('keenan_hock@unicron.systems')).toBe('Keenan');
    expect(senderFirstNameFromEmail('kyle-keka@example.com')).toBe('Kyle');
    expect(senderFirstNameFromEmail('kyle+pathfinder@freakngenius.com')).toBe('Kyle');
  });

  it('capitalises a bare local-part with no separator', () => {
    expect(senderFirstNameFromEmail('kyle@freakngenius.com')).toBe('Kyle');
  });

  it('returns "" on empty / null input', () => {
    expect(senderFirstNameFromEmail(null)).toBe('');
    expect(senderFirstNameFromEmail('')).toBe('');
  });
});

describe('buildV2DrafterUserPrompt', () => {
  it('embeds sender first name, recipient name+role+org, and project context', () => {
    const prompt = buildV2DrafterUserPrompt(txdotCtx);
    // Sender block
    expect(prompt).toContain('SENDER (Zedcor account executive');
    expect(prompt).toContain('First name: Kyle');
    expect(prompt).toContain('kyle@freakngenius.com');
    expect(prompt).toContain('gmail');
    // Recipient block
    expect(prompt).toContain('RECIPIENT (decision-maker');
    expect(prompt).toContain('Erik Soto');
    expect(prompt).toContain('District Security Manager');
    expect(prompt).toContain('TxDOT');
    expect(prompt).toContain('erik.soto@txdot.gov');
    // Project block
    expect(prompt).toContain('TxDOT I-45 Corridor');
    expect(prompt).toContain('$4,200,000');
    expect(prompt).toContain('8.5 mi');
    expect(prompt).toContain('Houston');
    expect(prompt).toContain('(TX)');
    expect(prompt).toContain('Procurement deadline: 2026-05-13');
    expect(prompt).toContain('NAICS: 561612');
  });

  it('marks rationale as internal-only context, not body fodder', () => {
    const prompt = buildV2DrafterUserPrompt(txdotCtx);
    expect(prompt).toContain('INTERNAL RATIONALE');
    expect(prompt).toContain('do NOT quote or paraphrase');
    expect(prompt).toContain('Strong fit. Verified.');
  });

  it('emits a "not connected" sender block when sender is null', () => {
    const prompt = buildV2DrafterUserPrompt({ ...txdotCtx, sender: null });
    expect(prompt).toContain('Not connected');
    expect(prompt).toContain('"Best,"');
  });

  it('greets by role when the recipient name is unknown but role is present', () => {
    const prompt = buildV2DrafterUserPrompt({
      ...txdotCtx,
      contact: {
        name: null,
        role: 'Director of Procurement',
        organization: 'TxDOT',
        email: null,
      },
    });
    expect(prompt).toContain('Role: Director of Procurement');
    expect(prompt).toContain('Name not specified');
  });

  it('embeds the warm-intro customer when present', () => {
    const prompt = buildV2DrafterUserPrompt({
      ...txdotCtx,
      warmIntroCustomer: 'Brasfield & Gorrie',
    });
    expect(prompt).toContain('Warm-intro customer reference: Brasfield & Gorrie');
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
        deadline: null,
        naics: null,
      },
      branch: null,
      contact: null,
      warmIntroCustomer: null,
      sender: null,
    });
    expect(prompt).not.toContain('Value:');
    expect(prompt).not.toContain('Distance to nearest');
    expect(prompt).not.toContain('Posted:');
    expect(prompt).not.toContain('Nearest Zedcor branch:');
    expect(prompt).not.toContain('Procurement deadline:');
    expect(prompt).not.toContain('NAICS:');
    expect(prompt).not.toContain('INTERNAL RATIONALE');
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

  it('throws when body exceeds 250 words', () => {
    const body = Array.from({ length: 251 }, (_, i) => `w${i}`).join(' ');
    const raw = JSON.stringify({
      subject: 'S',
      body,
      suggested_recipient_email: null,
    });
    expect(() => parseV2DraftResponse(raw)).toThrow(/body exceeded 250/);
  });

  it('rejects an em-dash in the body (Gate 12D ban)', () => {
    const raw = JSON.stringify({
      subject: 'S',
      body: 'TxDOT I-45 — a great fit for Zedcor.',
      suggested_recipient_email: null,
    });
    expect(() => parseV2DraftResponse(raw)).toThrow(/em-dash|en-dash/);
  });

  it('rejects an en-dash in the body (Gate 12D ban)', () => {
    const raw = JSON.stringify({
      subject: 'S',
      body: 'Houston – Texas perimeter security review.',
      suggested_recipient_email: null,
    });
    expect(() => parseV2DraftResponse(raw)).toThrow(/em-dash|en-dash/);
  });
});
