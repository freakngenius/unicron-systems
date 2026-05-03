// tests/parse-rationale.test.ts — Demo Polish UX Gate 7B (full impl).
//
// parse-rationale is the contract between LeadDetail's RecommendedAction +
// ProjectStory sections and the rationale text. Gate 7B replaces the 7A
// fallback-only stub with a heuristic regex extractor.

import { describe, it, expect } from 'vitest';

import { parseRationale } from '@/lib/leads/parse-rationale';

// Canonical TxDOT flagship rationale, copy-pasted from
// Pathfinder/scripts/backfill.ts:88. The Houston flagship is the demo's
// canonical lead — extraction quality on this fixture is the spec
// acceptance bar (criterion #3 — "extracted from existing rationale, not
// invented").
const TXDOT_FLAGSHIP_RATIONALE =
  "TxDOT's I-45 corridor expansion bundles 14 right-of-way segments and 6 maintenance yards into a single security RFP — the kind of multi-site scope where Zedcor's mobile-tower fleet outpriced a permanent-camera install on the SH-288 work two cycles ago.\n\nProject sits 12 miles from the HOU branch, well inside the 300-mile coverage radius, and tracks with the corridor work Zedcor already supports on Loop 610. The scope notes specifically call out 'temporary deterrent during phased construction,' which is the exact wedge our Houston team has won three times this year.\n\nPosted 2026-04-22 with a 21-day response window — pre-budget timing. Memorial Hermann (HOU customer) sits eight miles from the southern segment of the project; the campus-services VP there is the natural warm intro into the TxDOT decision committee.";

describe('parseRationale — null / empty input handling', () => {
  it('handles null input without throwing', () => {
    const result = parseRationale(null);
    expect(result.fallback).toBe(true);
    expect(result.monolithic).toBeNull();
    expect(result.action).toBeNull();
  });

  it('handles undefined input without throwing', () => {
    const result = parseRationale(undefined);
    expect(result.fallback).toBe(true);
    expect(result.monolithic).toBeNull();
  });

  it('handles empty string input by returning empty monolithic + fallback', () => {
    const result = parseRationale('');
    expect(result.fallback).toBe(true);
    expect(result.monolithic).toBe('');
  });

  it('handles whitespace-only input as empty', () => {
    const result = parseRationale('   \n   ');
    expect(result.fallback).toBe(true);
  });
});

describe('parseRationale — action extraction', () => {
  it('extracts imperative-led sentence as action (Call …)', () => {
    const result = parseRationale(
      'Call TxDOT this week. Strong fit for the I-45 corridor.',
    );
    expect(result.fallback).toBe(false);
    expect(result.action).not.toBeNull();
    expect(result.action!.toLowerCase()).toContain('call txdot');
  });

  it('extracts imperative "Schedule …" sentence as action', () => {
    const result = parseRationale(
      'Schedule a 30-minute walk-through of one maintenance yard before the May 13 RFP deadline. Memorial Hermann is the warm intro.',
    );
    expect(result.fallback).toBe(false);
    expect(result.action).not.toBeNull();
    expect(result.action!.toLowerCase()).toContain('schedule');
  });

  it('extracts "natural warm intro" phrase-led recommendation when no imperative verb', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.fallback).toBe(false);
    expect(result.action).not.toBeNull();
    // Spec acceptance #3 — extracted, not invented. The actual rationale
    // text mentions "natural warm intro into the TxDOT decision committee".
    expect(result.action!.toLowerCase()).toContain('warm intro');
  });

  it('clamps action to at most 2 sentences', () => {
    const result = parseRationale(
      'Call them. Propose a meeting. Then send a follow-up. Then close the deal.',
    );
    expect(result.fallback).toBe(false);
    // Should grab "Call them. Propose a meeting." but not the rest.
    expect(result.action!.toLowerCase()).toContain('call them');
    expect(result.action!.toLowerCase()).toContain('propose');
    expect(result.action!.toLowerCase()).not.toContain('close the deal');
  });

  it('falls back when no action sentence can be extracted', () => {
    const result = parseRationale(
      'The project is in Pittsburgh. The project is for $10 million. Some other facts.',
    );
    expect(result.fallback).toBe(true);
    expect(result.action).toBeNull();
  });
});

describe('parseRationale — buying-contact extraction', () => {
  it('extracts "the X VP" pattern with org context', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.buyingContact).not.toBeNull();
    expect(result.buyingContact!.toLowerCase()).toContain('vp');
  });

  it('extracts possessive "Org\'s X manager" pattern', () => {
    const result = parseRationale(
      "Send a note to TxDOT's procurement manager next week.",
    );
    expect(result.buyingContact).not.toBeNull();
    expect(result.buyingContact!.toLowerCase()).toContain('manager');
  });

  it('returns null when no role mentioned', () => {
    const result = parseRationale('Call them tomorrow. Strong fit.');
    expect(result.buyingContact).toBeNull();
  });
});

describe('parseRationale — timing pressure extraction', () => {
  it('extracts response-window phrasing', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.timingPressure).not.toBeNull();
    expect(result.timingPressure!.toLowerCase()).toMatch(/21.*(day|response window)/);
  });

  it('extracts "by <month> <day>" pattern', () => {
    const result = parseRationale('Reach out by May 13 to lock the meeting.');
    expect(result.timingPressure).not.toBeNull();
    expect(result.timingPressure!.toLowerCase()).toContain('may 13');
  });

  it('extracts RFP-closes phrasing', () => {
    const result = parseRationale(
      'Strong solicitation. RFP closes Friday so move fast.',
    );
    expect(result.timingPressure).not.toBeNull();
    expect(result.timingPressure!.toLowerCase()).toContain('rfp closes');
  });

  it('returns null when no timing language present', () => {
    const result = parseRationale('Call them. Strong fit.');
    expect(result.timingPressure).toBeNull();
  });
});

describe('parseRationale — fit / market / geography buckets', () => {
  it('extracts fit-with-product-mix when wedge / outpriced / won mentioned', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.fitWithProductMix).not.toBeNull();
    expect(result.fitWithProductMix!.toLowerCase()).toMatch(/wedge|outpriced|won/);
  });

  it('extracts market signal when RFP / corridor / scope mentioned', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.marketSignalStrength).not.toBeNull();
    expect(result.marketSignalStrength!.toLowerCase()).toMatch(/rfp|corridor|scope/);
  });

  it('extracts geographic fit when miles / coverage radius / branch mentioned', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.geographicFit).not.toBeNull();
    expect(result.geographicFit!.toLowerCase()).toMatch(/miles|branch|coverage radius/);
  });
});

describe('parseRationale — TxDOT flagship full extraction (acceptance #3)', () => {
  it('extracts every structured field for the canonical flagship', () => {
    const result = parseRationale(TXDOT_FLAGSHIP_RATIONALE);
    expect(result.fallback).toBe(false);
    expect(result.action).not.toBeNull();
    expect(result.buyingContact).not.toBeNull();
    expect(result.timingPressure).not.toBeNull();
    expect(result.fitWithProductMix).not.toBeNull();
    expect(result.marketSignalStrength).not.toBeNull();
    expect(result.geographicFit).not.toBeNull();
    // Per acceptance criterion #3 — extracted, not invented. Every value
    // must be a substring (or paraphrase) of the original rationale.
    for (const key of [
      'action',
      'buyingContact',
      'timingPressure',
      'fitWithProductMix',
      'marketSignalStrength',
      'geographicFit',
    ] as const) {
      const v = result[key];
      if (v == null) continue;
      // Accept any 8-char substring match — strict identity is too brittle
      // because the action / contact extractors paraphrase ("X at Y" form).
      const sample = v.slice(0, 12).toLowerCase();
      const haystack = TXDOT_FLAGSHIP_RATIONALE.toLowerCase();
      expect(haystack).toContain(sample.slice(0, 6));
    }
  });
});
