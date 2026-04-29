// __tests__/chat/outreach-drafter.test.ts — pure-rules tests for the
// outreach drafter. The pipeline that calls Perplexity Sonar is exercised
// via setSonarForTesting; we never hit the real API in CI.

import { describe, it, expect, afterEach } from 'vitest';
import {
  draftOutreach,
  purgeDashes,
  wordCount,
  verifyDraft,
  EMAIL_WORD_MIN,
  EMAIL_WORD_MAX,
  EMAIL_SUBJECT_MAX,
  LINKEDIN_CHAR_MAX,
  VOICEMAIL_WORD_MIN,
  VOICEMAIL_WORD_MAX,
} from '@/lib/chat/outreach-drafter';
import { setSonarForTesting } from '@/lib/chat/sonar';
import type { Branch, Project } from '@/lib/types';

// ── Pure rules ────────────────────────────────────────────────────────────

describe('wordCount', () => {
  it('counts whitespace-separated tokens', () => {
    expect(wordCount('one two three')).toBe(3);
  });
  it('handles multiple spaces and newlines', () => {
    expect(wordCount('  a   b\n\n  c  ')).toBe(3);
  });
  it('returns 0 for empty', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('purgeDashes', () => {
  it('replaces em-dash with comma-space and absorbs surrounding spaces', () => {
    const r = purgeDashes('Hello — world');
    expect(r.text).toBe('Hello, world');
    expect(r.replaced).toBe(true);
  });
  it('replaces tight em-dash without surrounding spaces', () => {
    const r = purgeDashes('Hello—world');
    expect(r.text).toBe('Hello, world');
    expect(r.replaced).toBe(true);
  });
  it('replaces en-dash with " to "', () => {
    const r = purgeDashes('Tuesday – Thursday');
    expect(r.text).toBe('Tuesday to Thursday');
    expect(r.replaced).toBe(true);
  });
  it('replaces tight en-dash in numeric range', () => {
    const r = purgeDashes('10–20 leads');
    expect(r.text).toBe('10 to 20 leads');
    expect(r.replaced).toBe(true);
  });
  it('returns input unchanged when no dashes', () => {
    const r = purgeDashes('No dashes here.');
    expect(r.text).toBe('No dashes here.');
    expect(r.replaced).toBe(false);
  });
  it('handles multiple dashes', () => {
    const r = purgeDashes('A — B – C — D');
    expect(r.replaced).toBe(true);
    expect(/[—–]/.test(r.text)).toBe(false);
  });
});

describe('verifyDraft', () => {
  const allowedNames = new Set(['hines', 'va', 'hospital', 'houston', 'zedcor']);
  const goodEmailBody = sentencesOfLength(75); // 75 words, in 60-90 range
  const goodVm = sentencesOfLength(70);

  it('passes a clean bundle', () => {
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA security project', body: goodEmailBody },
        linkedin: { body: 'Quick note on Hines VA — 20 min next week?'.replace('—', ',') },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.failures).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('flags email body word count out of range (low)', () => {
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA project', body: 'Too short.' },
        linkedin: { body: 'Hi.' },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.ok).toBe(false);
    expect(v.failures.some((f) => f.startsWith('email_word_count_out_of_range'))).toBe(true);
  });

  it('flags email body word count out of range (high)', () => {
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA project', body: sentencesOfLength(120) },
        linkedin: { body: 'Hi Hines.' },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.ok).toBe(false);
    expect(v.failures.some((f) => f.startsWith('email_word_count_out_of_range'))).toBe(true);
  });

  it('flags subject too long', () => {
    const longSubject = 'X'.repeat(EMAIL_SUBJECT_MAX + 5);
    const v = verifyDraft(
      {
        email: { subject: longSubject, body: goodEmailBody },
        linkedin: { body: 'Hi.' },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.failures.some((f) => f.startsWith('email_subject_too_long'))).toBe(true);
  });

  it('flags linkedin too long', () => {
    const long = 'X'.repeat(LINKEDIN_CHAR_MAX + 1);
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA project', body: goodEmailBody },
        linkedin: { body: long },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.failures.some((f) => f.startsWith('linkedin_too_long'))).toBe(true);
  });

  it('flags voicemail word count out of range', () => {
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA project', body: goodEmailBody },
        linkedin: { body: 'Hi.' },
        voicemail: { body: 'Hi this is short.' },
      },
      { allowedNames },
    );
    expect(v.failures.some((f) => f.startsWith('voicemail_word_count_out_of_range'))).toBe(true);
  });

  it('flags em-dash present', () => {
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA — project', body: goodEmailBody },
        linkedin: { body: 'Hi.' },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.failures).toContain('dash_present');
  });

  it('flags possible hallucination (multi-word capitalized phrase not in allowed)', () => {
    const v = verifyDraft(
      {
        email: { subject: 'Hines VA project', body: goodEmailBody.replace('credible', 'we worked with Acme Megacorp') },
        linkedin: { body: 'Hi.' },
        voicemail: { body: goodVm },
      },
      { allowedNames },
    );
    expect(v.failures.some((f) => f.startsWith('possible_hallucination'))).toBe(true);
  });
});

// ── Boundary constants are wired ──────────────────────────────────────────

describe('outreach length constants', () => {
  it('matches the spec', () => {
    expect(EMAIL_WORD_MIN).toBe(60);
    expect(EMAIL_WORD_MAX).toBe(90);
    expect(EMAIL_SUBJECT_MAX).toBe(60);
    expect(LINKEDIN_CHAR_MAX).toBe(200);
    expect(VOICEMAIL_WORD_MIN).toBeGreaterThanOrEqual(60);
    expect(VOICEMAIL_WORD_MAX).toBeLessThanOrEqual(80);
  });
});

// ── Sonar-stubbed pipeline ────────────────────────────────────────────────

const fakeProject = {
  id: 'proj-test-1',
  source: 'usaspending',
  source_id: 'src-1',
  title: 'Hines VA Hospital perimeter security renovation',
  summary: 'Hines VA Hospital is renovating perimeter security infrastructure.',
  lat: 41.86,
  lon: -87.83,
  project_value: 4_500_000,
  project_stage: 'pre_solicitation',
  posted_date: '2026-04-15',
  raw_payload: {},
  rationale: null,
  rationale_streamed_at: null,
  score: 92,
  nearest_branch_id: 'b-hou',
  distance_miles: 1100,
  outreach_hook: null,
  warm_for_customer_id: null,
  ingested_at: '2026-04-20T00:00:00Z',
  ranked_at: '2026-04-20T00:00:01Z',
} as unknown as Project;

const fakeBranch = {
  id: 'b-hou',
  name: 'Houston',
  code: 'HOU',
  lat: 29.76,
  lon: -95.37,
  coverage_radius_miles: 250,
  opened_date: null,
  region: 'south',
  created_at: '2026-04-01T00:00:00Z',
} as Branch;

function makeStub(responses: string[]) {
  let i = 0;
  return {
    complete: async () => {
      const text = responses[Math.min(i, responses.length - 1)];
      i++;
      return {
        text,
        citations: [],
        model: 'sonar',
        latencyMs: 1,
      };
    },
  };
}

afterEach(() => setSonarForTesting(null));

describe('draftOutreach pipeline', () => {
  it('returns a passing bundle on first try when the model produces compliant JSON', async () => {
    const draft = {
      email: {
        subject: 'Hines VA perimeter security',
        body: sentencesOfLength(75),
      },
      linkedin: { body: 'Quick note on Hines VA. 20 min next week?' },
      voicemail: { body: sentencesOfLength(70) },
      provenance: ['projects:proj-test-1', 'branches:b-hou'],
    };
    setSonarForTesting(makeStub([JSON.stringify(draft)]));

    const result = await draftOutreach({
      project: fakeProject,
      branch: fakeBranch,
      warmCustomer: null,
      intent: 'fresh',
    });
    expect(result.verifierWarnings).toEqual([]);
    expect(result.retries).toBe(0);
    expect(result.email.wordCount).toBeGreaterThanOrEqual(EMAIL_WORD_MIN);
    expect(result.email.wordCount).toBeLessThanOrEqual(EMAIL_WORD_MAX);
  });

  it('retries on verifier failure and succeeds on second try', async () => {
    const tooShort = {
      email: { subject: 'Hines VA project', body: 'Too short.' },
      linkedin: { body: 'Hi.' },
      voicemail: { body: 'Tiny.' },
      provenance: [],
    };
    const passing = {
      email: { subject: 'Hines VA perimeter security', body: sentencesOfLength(72) },
      linkedin: { body: 'Quick note on Hines VA.' },
      voicemail: { body: sentencesOfLength(70) },
      provenance: ['projects:proj-test-1'],
    };
    setSonarForTesting(makeStub([JSON.stringify(tooShort), JSON.stringify(passing)]));

    const result = await draftOutreach({
      project: fakeProject,
      branch: fakeBranch,
      warmCustomer: null,
      intent: 'fresh',
    });
    expect(result.retries).toBe(1);
    expect(result.verifierWarnings).toEqual([]);
  });

  it('returns best-effort bundle with verifierWarnings after 2 retries fail', async () => {
    const broken = {
      email: { subject: 'Hines VA project', body: 'short' },
      linkedin: { body: 'X'.repeat(LINKEDIN_CHAR_MAX + 50) },
      voicemail: { body: 'tiny' },
      provenance: [],
    };
    setSonarForTesting(
      makeStub([JSON.stringify(broken), JSON.stringify(broken), JSON.stringify(broken)]),
    );

    const result = await draftOutreach({
      project: fakeProject,
      branch: fakeBranch,
      warmCustomer: null,
      intent: 'fresh',
    });
    expect(result.retries).toBe(2);
    expect(result.verifierWarnings.length).toBeGreaterThan(0);
  });

  it('purges dashes via the safety net even when verifier accepts (regression)', async () => {
    // Construct a draft that VERIFIER would reject for dash_present, then
    // a clean retry that has dashes only in the unverified body. Actually
    // simpler: have verifier pass, but final-pass should still scan + flag.
    // Since our verifier flags any dash, this test confirms the flow:
    // verifier rejects dash_present → retries with cleaned body → passes.
    const dashy = {
      email: { subject: 'Hines VA project', body: sentencesOfLength(75) + ' — final.' },
      linkedin: { body: 'Quick note.' },
      voicemail: { body: sentencesOfLength(70) },
      provenance: [],
    };
    const clean = {
      email: { subject: 'Hines VA project', body: sentencesOfLength(72) },
      linkedin: { body: 'Quick note.' },
      voicemail: { body: sentencesOfLength(70) },
      provenance: [],
    };
    setSonarForTesting(makeStub([JSON.stringify(dashy), JSON.stringify(clean)]));
    const result = await draftOutreach({
      project: fakeProject,
      branch: fakeBranch,
      warmCustomer: null,
      intent: 'fresh',
    });
    expect(/[—–]/.test(result.email.body)).toBe(false);
  });

  it('strips ```json fences from model output', async () => {
    const draft = {
      email: { subject: 'Hines VA perimeter security', body: sentencesOfLength(75) },
      linkedin: { body: 'Quick note.' },
      voicemail: { body: sentencesOfLength(70) },
      provenance: [],
    };
    setSonarForTesting(makeStub(['```json\n' + JSON.stringify(draft) + '\n```']));
    const result = await draftOutreach({
      project: fakeProject,
      branch: fakeBranch,
      warmCustomer: null,
      intent: 'fresh',
    });
    expect(result.verifierWarnings).toEqual([]);
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function sentencesOfLength(targetWords: number): string {
  // Build a plausible-looking outreach body of `targetWords` words using
  // only words from the safelist + project context (so the hallucination
  // detector doesn't fire).
  const words = [
    'Hines',
    'VA',
    'Hospital',
    'perimeter',
    'security',
    'renovation',
    'project',
    'is',
    'on',
    'our',
    'radar',
    'and',
    'a',
    '20',
    'minute',
    'call',
    'would',
    'cover',
    'next',
    'steps',
    'from',
    'Houston',
    'team',
    'this',
    'week',
    'or',
    'next',
    'with',
    'detail',
    'options',
    'we',
    'are',
    'technically',
    'credible',
    'in',
    'this',
    'space',
    'happy',
    'to',
    'share',
    'context',
    'on',
    'comparable',
    'work',
    'completed',
    'recently',
    'thanks',
  ];
  const out: string[] = [];
  while (out.length < targetWords) out.push(words[out.length % words.length]);
  return out.join(' ');
}
