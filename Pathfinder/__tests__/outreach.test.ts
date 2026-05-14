// __tests__/outreach.test.ts — unit tests for the pure helpers in
// lib/outreach.ts. These cover the validators, parser, prompt builder,
// dash substitution, contact extraction, and the buildInsertRows
// function. Anything that touches the Anthropic SDK is excluded — that
// path is exercised in dev via the cron route hitting a real project.

import { describe, expect, it } from 'vitest';
import {
  buildInsertRows,
  buildOutreachUserPrompt,
  containsDashes,
  countChars,
  countWords,
  EMAIL_WORDS_MAX,
  EMAIL_WORDS_MIN,
  extractContactFromRawPayload,
  LINKEDIN_CHARS_MAX,
  parseOutreachOutput,
  substituteDashes,
  substituteDashesInBundle,
  validateBundle,
  validateEmail,
  validateLinkedIn,
  validateNoHallucinatedCustomers,
  validateVoicemail,
  VOICEMAIL_WORDS_MAX,
  VOICEMAIL_WORDS_MIN,
  type OutreachBundle,
} from '@/lib/outreach';

// ────────────────────────────────────────────────────────────────────
// Helpers — fixture builders
// ────────────────────────────────────────────────────────────────────

function emailBodyOfLength(words: number): string {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(' ');
}

function fixtureBundle(overrides: Partial<OutreachBundle> = {}): OutreachBundle {
  // 75-word email body that includes the "20-minute" CTA so structure
  // checks pass by default.
  const body =
    'Saw the Hines VA Hospital perimeter scope (project value listed) and wanted to flag timing. ' +
    'Your published RFP window suggests a security walkthrough lands in the next 30 days, ' +
    'and Zedcor has covered three similar hospital builds in the Houston corridor. ' +
    'Could we hold a 20 minute call this Thursday at 10am or Friday at 2pm to walk the camera plan? ' +
    'Happy to share the spec we used at the prior site.';
  return {
    email: { subject: 'Hines VA perimeter timing', body },
    linkedin: {
      body:
        'Saw the Hines VA Hospital RFP timing. Zedcor has covered three similar hospital ' +
        'builds in the Houston corridor; worth a 20 min on Thursday?',
    },
    voicemail: {
      body:
        'Hi, this is Zedcor calling on the Hines VA Hospital perimeter scope. We saw ' +
        'the RFP window lands in the next 30 days. Zedcor has covered three similar ' +
        'hospital builds in the Houston corridor over the last two years. We would love ' +
        'a 20 minute call this Thursday morning to walk through the camera plan. ' +
        'Calling back at this number, or you can reach me at the office number on file. ' +
        'Thanks for the time.',
    },
    provenance: ['projects:VA-HINES-2026', 'branches:HOU'],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────
// Counting helpers
// ────────────────────────────────────────────────────────────────────

describe('countWords / countChars / containsDashes', () => {
  it('countWords handles empty + whitespace + multi-space', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('one two three')).toBe(3);
    expect(countWords('  one\ttwo\nthree  ')).toBe(3);
  });

  it('countChars is raw length', () => {
    expect(countChars('')).toBe(0);
    expect(countChars('hello')).toBe(5);
  });

  it('containsDashes detects em and en dashes', () => {
    expect(containsDashes('plain text')).toBe(false);
    expect(containsDashes('hyphen-only')).toBe(false);
    expect(containsDashes('em—dash')).toBe(true);
    expect(containsDashes('en–dash')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Email validator
// ────────────────────────────────────────────────────────────────────

describe('validateEmail — length rules', () => {
  it('passes a 75-word body with valid subject and 20-minute CTA', () => {
    const body = emailBodyOfLength(75) + ' Could we do a 20 minute call Thursday?';
    expect(validateEmail('Hines VA timing', body)).toEqual([]);
  });

  it('flags subject too long', () => {
    const subject = 'x'.repeat(70);
    const body = emailBodyOfLength(75) + ' twenty minute call Thursday?';
    expect(validateEmail(subject, body)).toContain('email_subject_too_long');
  });

  it('flags body too short', () => {
    // 50 + " 20 minute call?" (3 words) = 53 — well under EMAIL_WORDS_MIN.
    const body = emailBodyOfLength(50) + ' 20 minute call?';
    expect(validateEmail('subject', body)).toContain('email_body_too_short');
  });

  it('flags body too long', () => {
    const body = emailBodyOfLength(EMAIL_WORDS_MAX + 5) + ' 20 minute call?';
    expect(validateEmail('subject', body)).toContain('email_body_too_long');
  });

  it('flags missing 20-minute CTA', () => {
    const body = emailBodyOfLength(75);
    expect(validateEmail('subject', body)).toContain('email_missing_20min_cta');
  });

  it('accepts both "20 minute" and "twenty minute" phrasing', () => {
    const a = emailBodyOfLength(75) + ' lets do a 20 minute call';
    const b = emailBodyOfLength(75) + ' lets do a twenty minute call';
    expect(validateEmail('s', a)).not.toContain('email_missing_20min_cta');
    expect(validateEmail('s', b)).not.toContain('email_missing_20min_cta');
  });
});

describe('validateEmail — tone rules', () => {
  it('flags em-dashes', () => {
    const body = emailBodyOfLength(75) + ' tighter— 20 minute call?';
    expect(validateEmail('subject', body)).toContain('email_contains_dash');
  });

  it('flags en-dashes', () => {
    const body = emailBodyOfLength(75) + ' a span–2 days · 20 minute?';
    expect(validateEmail('subject', body)).toContain('email_contains_dash');
  });

  it('flags name placeholder leakage', () => {
    const body = 'Hi [Name], ' + emailBodyOfLength(73) + ' 20 minute call?';
    expect(validateEmail('subject', body)).toContain('email_name_placeholder_leak');
  });

  it('flags generic salutation "dear there"', () => {
    const body = 'Dear there, ' + emailBodyOfLength(73) + ' 20 minute call?';
    expect(validateEmail('subject', body)).toContain('email_generic_salutation');
  });
});

// ────────────────────────────────────────────────────────────────────
// LinkedIn validator
// ────────────────────────────────────────────────────────────────────

describe('validateLinkedIn', () => {
  it('passes a sub-200-char DM', () => {
    expect(validateLinkedIn('Saw the RFP timing on Hines VA. Zedcor covered three similar builds in Houston. Worth a 20-min call?')).toEqual([]);
  });

  it('flags too long', () => {
    const body = 'x'.repeat(LINKEDIN_CHARS_MAX + 1);
    expect(validateLinkedIn(body)).toContain('linkedin_too_long');
  });

  it('flags em-dashes', () => {
    expect(validateLinkedIn('em—dash here')).toContain('linkedin_contains_dash');
  });

  it('flags name placeholder leakage', () => {
    expect(validateLinkedIn('Hi [Name], hope all is well.')).toContain('linkedin_name_placeholder_leak');
  });
});

// ────────────────────────────────────────────────────────────────────
// Voicemail validator
// ────────────────────────────────────────────────────────────────────

describe('validateVoicemail', () => {
  it('passes a 70-word voicemail', () => {
    const body = emailBodyOfLength(70);
    expect(validateVoicemail(body)).toEqual([]);
  });

  it('flags voicemail too short', () => {
    const body = emailBodyOfLength(VOICEMAIL_WORDS_MIN - 5);
    expect(validateVoicemail(body)).toContain('voicemail_too_short');
  });

  it('flags voicemail too long', () => {
    const body = emailBodyOfLength(VOICEMAIL_WORDS_MAX + 5);
    expect(validateVoicemail(body)).toContain('voicemail_too_long');
  });

  it('flags em-dashes', () => {
    const body = emailBodyOfLength(70) + ' end— dash';
    expect(validateVoicemail(body)).toContain('voicemail_contains_dash');
  });
});

// ────────────────────────────────────────────────────────────────────
// Hallucination check
// ────────────────────────────────────────────────────────────────────

describe('validateNoHallucinatedCustomers', () => {
  it('passes when no customer names appear', () => {
    const b = fixtureBundle();
    expect(validateNoHallucinatedCustomers(b, [])).toEqual([]);
  });

  it('passes when an existing customer is referenced', () => {
    const b = fixtureBundle({
      email: {
        subject: 'Hines VA timing',
        body: emailBodyOfLength(75) + ' Lyondell Industries is the warm intro. 20 minute Thursday?',
      },
    });
    expect(
      validateNoHallucinatedCustomers(b, ['Lyondell Industries']),
    ).toEqual([]);
  });

  it('flags a fabricated customer reference', () => {
    const b = fixtureBundle({
      email: {
        subject: 'Hines VA timing',
        body: emailBodyOfLength(75) + ' Acme Builders LLC has loved working with us. 20 minute Thursday?',
      },
    });
    expect(
      validateNoHallucinatedCustomers(b, ['Lyondell Industries']),
    ).toContain('outreach_unknown_customer_reference');
  });
});

// ────────────────────────────────────────────────────────────────────
// validateBundle aggregator
// ────────────────────────────────────────────────────────────────────

describe('validateBundle', () => {
  it('returns empty array on a clean bundle', () => {
    expect(validateBundle(fixtureBundle(), { allowedCustomerNames: [] })).toEqual([]);
  });

  it('aggregates warnings across channels', () => {
    const bundle = fixtureBundle({
      email: { subject: 'x'.repeat(80), body: emailBodyOfLength(20) },
      linkedin: { body: 'x'.repeat(LINKEDIN_CHARS_MAX + 1) },
    });
    const warnings = validateBundle(bundle, { allowedCustomerNames: [] });
    expect(warnings).toContain('email_subject_too_long');
    expect(warnings).toContain('email_body_too_short');
    expect(warnings).toContain('linkedin_too_long');
  });
});

// ────────────────────────────────────────────────────────────────────
// substituteDashes
// ────────────────────────────────────────────────────────────────────

describe('substituteDashes', () => {
  it('no-ops when no dashes present', () => {
    const r = substituteDashes('plain text');
    expect(r.substituted).toBe(false);
    expect(r.text).toBe('plain text');
  });

  it('substitutes em-dash with comma+space', () => {
    const r = substituteDashes('quick—fix');
    expect(r.substituted).toBe(true);
    expect(r.text).toBe('quick, fix');
  });

  it('substitutes en-dash with " to "', () => {
    const r = substituteDashes('60–90 days');
    expect(r.substituted).toBe(true);
    expect(r.text).toBe('60 to 90 days');
  });

  it('substituteDashesInBundle clears all channels', () => {
    const bundle = fixtureBundle({
      email: {
        subject: 'em—dash subj',
        body: emailBodyOfLength(75) + ' 20 minute, with em—dash inside',
      },
      linkedin: { body: 'Linked—In dash' },
      voicemail: { body: emailBodyOfLength(70) + ' – voicemail dash' },
    });
    const out = substituteDashesInBundle(bundle);
    expect(out.substituted).toBe(true);
    expect(out.bundle.email.subject.includes('—')).toBe(false);
    expect(out.bundle.email.body.includes('—')).toBe(false);
    expect(out.bundle.linkedin.body.includes('—')).toBe(false);
    expect(out.bundle.voicemail.body.includes('–')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// parseOutreachOutput
// ────────────────────────────────────────────────────────────────────

describe('parseOutreachOutput', () => {
  it('parses a clean JSON object', () => {
    const json = JSON.stringify({
      email: { subject: 's', body: 'b' },
      linkedin: { body: 'l' },
      voicemail: { body: 'v' },
      provenance: ['projects:1'],
    });
    const r = parseOutreachOutput(json);
    expect(r.email.subject).toBe('s');
    expect(r.linkedin.body).toBe('l');
    expect(r.provenance).toEqual(['projects:1']);
  });

  it('strips ```json fences', () => {
    const fenced = '```json\n' + JSON.stringify({
      email: { subject: 's', body: 'b' },
      linkedin: { body: 'l' },
      voicemail: { body: 'v' },
      provenance: [],
    }) + '\n```';
    expect(() => parseOutreachOutput(fenced)).not.toThrow();
  });

  it('throws on missing channel fields', () => {
    const json = JSON.stringify({ email: { subject: 's' } });
    expect(() => parseOutreachOutput(json)).toThrow();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseOutreachOutput('not json')).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────
// buildOutreachUserPrompt
// ────────────────────────────────────────────────────────────────────

describe('buildOutreachUserPrompt', () => {
  it('embeds project, branch, and warm-customer context', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P1',
        title: 'Hines VA Hospital perimeter',
        summary: 's',
        project_value: 4_200_000,
        project_stage: 'RFP',
        distance_miles: 38.4,
        rationale: 'r',
        outreach_hook: 'h',
        lat: 29.7,
        lon: -95.4,
        raw_payload: null,
        warm_for_customer_id: 'C1',
        nearest_branch_id: 'HOU',
      },
      branch: { id: 'HOU', name: 'Houston', code: 'HOU', region: 'TX' },
      warmCustomer: { id: 'C1', name: 'Lyondell Industries' },
      contact: { name: 'Karen Chen', title: 'PM', contact: 'k@example.com' },
    });
    expect(prompt).toContain('Hines VA Hospital perimeter');
    expect(prompt).toContain('Houston');
    expect(prompt).toContain('Lyondell Industries');
    expect(prompt).toContain('Karen Chen');
  });

  it('omits warm-customer block when none', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P2',
        title: 'X',
        summary: null,
        project_value: null,
        project_stage: null,
        distance_miles: null,
        rationale: null,
        outreach_hook: null,
        lat: null,
        lon: null,
        raw_payload: null,
        warm_for_customer_id: null,
        nearest_branch_id: null,
      },
      branch: null,
      warmCustomer: null,
      contact: { name: null, title: null, contact: null },
    });
    expect(prompt).toContain('do not claim any prior Zedcor relationship');
    expect(prompt).toContain('open with project reference instead');
  });

  it('embeds iteration block when provided', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P3',
        title: 'X',
        summary: null,
        project_value: null,
        project_stage: null,
        distance_miles: null,
        rationale: null,
        outreach_hook: null,
        lat: null,
        lon: null,
        raw_payload: null,
        warm_for_customer_id: null,
        nearest_branch_id: null,
      },
      branch: null,
      warmCustomer: null,
      contact: { name: null, title: null, contact: null },
      iteration: {
        priorBundle: fixtureBundle(),
        instruction: 'make it tighter',
      },
    });
    expect(prompt).toContain('ITERATION');
    expect(prompt).toContain('make it tighter');
  });

  it('includes RELATIONSHIP CONTEXT block with engine match metadata when crossPollination is provided', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P4',
        title: 'GSA award to Brasfield Gorrie',
        summary: null,
        project_value: 212_000_000,
        project_stage: null,
        distance_miles: 65,
        rationale: null,
        outreach_hook: null,
        lat: null,
        lon: null,
        raw_payload: null,
        warm_for_customer_id: null,
        nearest_branch_id: null,
      },
      branch: { id: 'JAX', name: 'Jacksonville', code: 'JAX', region: 'FL' },
      warmCustomer: null,
      contact: { name: null, title: null, contact: null },
      crossPollination: [
        {
          customer_canonical: 'brasfield gorrie',
          match_layer: 'exact',
          match_confidence: 1.0,
          matched_field: 'prime_contractor',
          primary_branch_name: 'Jacksonville',
          branch_count: 2,
          active_site_count: 2,
          most_recent_site_date: '2026-04-15',
          national_account: false,
        },
      ],
    });
    expect(prompt).toContain('RELATIONSHIP CONTEXT');
    expect(prompt).toContain('Brasfield Gorrie');
    expect(prompt).toContain('exact');
    expect(prompt).toContain('Jacksonville branch');
    expect(prompt).toContain('2 active sites');
    // New warm-intro prompt structure (no representative_sites in this
    // test fixture, so the prompt falls through to the no-site phrasing).
    expect(prompt).toContain('WARM-INTRO WEAVE INSTRUCTIONS');
    expect(prompt).toContain('The email opening MUST do TWO things');
    expect(prompt).toContain('the prime on your project, Brasfield Gorrie, is one of ours');
  });

  it('names a specific past jobsite when representative_sites is populated', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P4b',
        title: 'GSA award to Big-D',
        summary: null,
        project_value: 5_000_000,
        project_stage: null,
        distance_miles: 12,
        rationale: null,
        outreach_hook: null,
        lat: null,
        lon: null,
        raw_payload: null,
        warm_for_customer_id: null,
        nearest_branch_id: null,
      },
      branch: { id: 'PHX', name: 'Phoenix', code: 'PHX', region: 'AZ' },
      warmCustomer: null,
      contact: { name: null, title: null, contact: null },
      crossPollination: [
        {
          customer_canonical: 'big-d construction',
          match_layer: 'exact',
          match_confidence: 1.0,
          matched_field: 'prime_contractor',
          matched_value_raw: 'BIG-D CONSTRUCTION CORP',
          primary_branch_name: 'Phoenix',
          branch_count: 1,
          active_site_count: 1,
          most_recent_site_date: '2026-05-02',
          national_account: false,
          representative_sites: [
            {
              site_name: 'Marbella Ranch - 7725 N El Mirage Rd, Glendale AZ 85307',
              city: 'Glendale',
              state: 'AZ',
              customer_name_raw: 'Big-D Construction',
            },
          ],
        },
      ],
    });
    expect(prompt).toContain('matched customer: Big-D Construction');
    expect(prompt).toContain('past Zedcor jobsites for this customer');
    expect(prompt).toContain('Marbella Ranch');
    expect(prompt).toContain('Glendale, AZ');
    expect(prompt).toContain('raw value matched on the lead: "BIG-D CONSTRUCTION CORP"');
    expect(prompt).toContain('NAME ONE of the representative jobsites');
  });

  it('falls back to cold-lead language when crossPollination is empty/null', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P5',
        title: 'X',
        summary: null,
        project_value: null,
        project_stage: null,
        distance_miles: null,
        rationale: null,
        outreach_hook: null,
        lat: null,
        lon: null,
        raw_payload: null,
        warm_for_customer_id: null,
        nearest_branch_id: null,
      },
      branch: null,
      warmCustomer: null,
      contact: { name: null, title: null, contact: null },
      crossPollination: [],
    });
    expect(prompt).toContain('this is a cold lead');
    expect(prompt).not.toContain('Email opening sentence MUST reference');
  });

  it('lists additional matches when more than one cross-poll row is supplied', () => {
    const prompt = buildOutreachUserPrompt({
      project: {
        id: 'P6',
        title: 'multi',
        summary: null,
        project_value: null,
        project_stage: null,
        distance_miles: null,
        rationale: null,
        outreach_hook: null,
        lat: null,
        lon: null,
        raw_payload: null,
        warm_for_customer_id: null,
        nearest_branch_id: null,
      },
      branch: null,
      warmCustomer: null,
      contact: { name: null, title: null, contact: null },
      crossPollination: [
        {
          customer_canonical: 'big-d construction',
          match_layer: 'exact',
          match_confidence: 1.0,
          matched_field: 'prime_contractor',
          primary_branch_name: 'Phoenix',
          branch_count: 1,
          active_site_count: 1,
          most_recent_site_date: null,
          national_account: false,
        },
        {
          customer_canonical: 'big d holdings',
          match_layer: 'parent_company',
          match_confidence: 0.85,
          matched_field: 'parent_company',
          primary_branch_name: null,
          branch_count: 0,
          active_site_count: 0,
          most_recent_site_date: null,
          national_account: false,
        },
      ],
    });
    expect(prompt).toContain('additional matches');
    expect(prompt).toContain('Big D Holdings');
  });
});

// ────────────────────────────────────────────────────────────────────
// extractContactFromRawPayload
// ────────────────────────────────────────────────────────────────────

describe('extractContactFromRawPayload', () => {
  it('returns nulls on null/empty payloads', () => {
    expect(extractContactFromRawPayload(null)).toEqual({ name: null, title: null, contact: null });
    expect(extractContactFromRawPayload({})).toEqual({ name: null, title: null, contact: null });
  });

  it('reads recipient_name (USAspending shape)', () => {
    const c = extractContactFromRawPayload({ recipient_name: 'Acme Construction Co' });
    expect(c.name).toBe('Acme Construction Co');
  });

  it('reads pointOfContact[0].fullName/title/email (SAM.gov shape)', () => {
    const c = extractContactFromRawPayload({
      pointOfContact: [{ fullName: 'Karen Chen', title: 'PM', email: 'k@example.com' }],
    });
    expect(c.name).toBe('Karen Chen');
    expect(c.title).toBe('PM');
    expect(c.contact).toBe('k@example.com');
  });

  it('prefers SAM.gov pointOfContact over USAspending recipient_name when both present', () => {
    const c = extractContactFromRawPayload({
      recipient_name: 'Acme Construction Co',
      pointOfContact: [{ fullName: 'Karen Chen', email: 'k@example.com' }],
    });
    expect(c.name).toBe('Karen Chen');
  });

  it('treats whitespace-only strings as null', () => {
    const c = extractContactFromRawPayload({ recipient_name: '   ' });
    expect(c.name).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// buildInsertRows — three rows per project, channel-scoped warnings
// ────────────────────────────────────────────────────────────────────

describe('buildInsertRows', () => {
  const args = {
    project: { id: 'P1', warm_for_customer_id: 'C1' },
    contact: { name: 'Karen', title: 'PM', contact: 'k@example.com' },
    bundle: fixtureBundle(),
    warnings: [],
    modelUsed: 'claude-sonnet-4-6',
  };

  it('produces exactly 3 rows, one per channel', () => {
    const rows = buildInsertRows(args);
    expect(rows.map((r) => r.channel)).toEqual(['email', 'linkedin', 'voicemail']);
    expect(rows.every((r) => r.project_id === 'P1')).toBe(true);
  });

  it('email row has subject; linkedin/voicemail rows do not', () => {
    const rows = buildInsertRows(args);
    expect(rows[0].draft_subject).not.toBeNull();
    expect(rows[1].draft_subject).toBeNull();
    expect(rows[2].draft_subject).toBeNull();
  });

  it('warm_intro_via copies through from project.warm_for_customer_id', () => {
    const rows = buildInsertRows(args);
    expect(rows.every((r) => r.warm_intro_via === 'C1')).toBe(true);
  });

  it('warm_intro_via is null when project has no warm path', () => {
    const rows = buildInsertRows({
      ...args,
      project: { id: 'P2', warm_for_customer_id: null },
    });
    expect(rows.every((r) => r.warm_intro_via === null)).toBe(true);
  });

  it('per-channel warning filtering', () => {
    const rows = buildInsertRows({
      ...args,
      warnings: [
        'email_body_too_short',
        'linkedin_too_long',
        'voicemail_too_short',
        'dash_substituted',
      ],
    });
    const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r.verifier_warnings]));
    expect(byChannel.email).toEqual(['email_body_too_short', 'dash_substituted']);
    expect(byChannel.linkedin).toEqual(['linkedin_too_long', 'dash_substituted']);
    expect(byChannel.voicemail).toEqual(['voicemail_too_short', 'dash_substituted']);
  });

  it('hallucination warning is global — lands on every channel', () => {
    const rows = buildInsertRows({
      ...args,
      warnings: ['outreach_unknown_customer_reference'],
    });
    expect(rows.every((r) => r.verifier_warnings.includes('outreach_unknown_customer_reference'))).toBe(true);
  });

  it('word_count and char_count populated from body', () => {
    const rows = buildInsertRows(args);
    const email = rows.find((r) => r.channel === 'email')!;
    expect(email.word_count).toBeGreaterThanOrEqual(EMAIL_WORDS_MIN);
    expect(email.word_count).toBeLessThanOrEqual(EMAIL_WORDS_MAX);
    expect(email.char_count).toBe(args.bundle.email.body.length);
  });
});
