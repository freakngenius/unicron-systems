// __tests__/email/edits.test.ts — Stream B Gate B2.
//
// Unit tests for the levenshtein + captureEdit pure helpers. No mocks,
// no env, no I/O.

import { describe, expect, it } from 'vitest';

import { captureEdit, levenshtein } from '@/lib/email/edits';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns the length of the other string when one is empty', () => {
    expect(levenshtein('', 'abcd')).toBe(4);
    expect(levenshtein('xyz', '')).toBe(3);
  });

  it('counts substitutions, insertions, and deletions', () => {
    expect(levenshtein('cat', 'cut')).toBe(1); // substitution
    expect(levenshtein('cat', 'cats')).toBe(1); // insertion
    expect(levenshtein('cats', 'cat')).toBe(1); // deletion
    expect(levenshtein('kitten', 'sitting')).toBe(3); // classic example
  });

  it('handles longer realistic edits', () => {
    const draft = 'Hi Joe, saw you posted the bid for the VA hospital. Worth a 20-minute call?';
    const sent = 'Hey Joe, saw your VA hospital bid go up. Worth a 20-min chat this week?';
    const d = levenshtein(draft, sent);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(draft.length); // not a complete rewrite
  });
});

describe('captureEdit', () => {
  it('returns unchanged when draft equals sent', () => {
    const r = captureEdit({ draftBody: 'same', sentBody: 'same' });
    expect(r.unchanged).toBe(true);
    expect(r.edit_band).toBe('unchanged');
    expect(r.edit_distance).toBe(0);
    expect(r.similarity).toBe(1);
  });

  it('classifies a small one-character edit as minor', () => {
    // Insert one character into a long-enough body so delta < 10%.
    const draft = 'Hi Joe, saw the project posted today and wanted to flag it.';
    const sent = 'Hi Joe, saw the project posted today and wanted to flag it!';
    const r = captureEdit({ draftBody: draft, sentBody: sent });
    expect(r.edit_band).toBe('minor');
    expect(r.unchanged).toBe(false);
  });

  it('classifies a heavy rewrite as heavy', () => {
    const r = captureEdit({
      draftBody: 'Hi Joe, please consider our security firm for your VA project.',
      sentBody: 'Joe — quick note. Different angle, different firm, different ask entirely.',
    });
    expect(r.edit_band === 'heavy' || r.edit_band === 'moderate').toBe(true);
    expect(r.similarity).toBeLessThan(0.85);
  });

  it('handles empty draft against sent (compose-from-scratch)', () => {
    const sent = 'Hi Joe, brand new outreach.';
    const r = captureEdit({ draftBody: '', sentBody: sent });
    expect(r.unchanged).toBe(false);
    expect(r.edit_distance).toBe(sent.length);
    expect(r.similarity).toBe(0);
  });

  it('exposes character lengths for analytics', () => {
    const r = captureEdit({ draftBody: 'one two', sentBody: 'one two three' });
    expect(r.draft_length).toBe(7);
    expect(r.sent_length).toBe(13);
  });
});
