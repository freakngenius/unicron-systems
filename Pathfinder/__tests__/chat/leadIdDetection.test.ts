// __tests__/chat/leadIdDetection.test.ts
// Unit tests for the LEAD_ID_RE regex used in MarkdownRenderer to detect
// clickable lead-ID tokens in inline code spans.

import { describe, it, expect } from 'vitest';

// Mirror of the regex in MarkdownRenderer.tsx — keep in sync.
const LEAD_ID_RE =
  /^(?:[a-z][a-z0-9.]*:[A-Za-z0-9][A-Za-z0-9\-_]{4,}|[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+){2,})$/;

describe('LEAD_ID_RE — source-prefixed format', () => {
  it('matches harris: prefixed IDs', () => {
    expect(LEAD_ID_RE.test('harris:HC-METRO-2026-031')).toBe(true);
  });

  it('matches sam.gov: prefixed IDs', () => {
    expect(LEAD_ID_RE.test('sam.gov:SOLICIT-12345')).toBe(true);
  });

  it('matches usaspending: prefixed IDs', () => {
    expect(LEAD_ID_RE.test('usaspending:CTR-2026-001')).toBe(true);
  });

  it('matches news: prefixed IDs', () => {
    expect(LEAD_ID_RE.test('news:ABC-2026-123')).toBe(true);
  });

  it('rejects too-short value after colon', () => {
    expect(LEAD_ID_RE.test('harris:X123')).toBe(false); // value < 5 chars
  });

  it('rejects uppercase prefix before colon', () => {
    expect(LEAD_ID_RE.test('Harris:HC-METRO-2026-031')).toBe(false);
  });
});

describe('LEAD_ID_RE — direct uppercase format', () => {
  it('matches TxDOT-style IDs with 3+ segments', () => {
    expect(LEAD_ID_RE.test('TxDOT-I45-2026-001')).toBe(true);
  });

  it('matches 3-segment IDs', () => {
    expect(LEAD_ID_RE.test('HC-METRO-2026')).toBe(true);
  });

  it('rejects 2-segment IDs (only one hyphen)', () => {
    expect(LEAD_ID_RE.test('HC-METRO')).toBe(false);
  });

  it('rejects lowercase-starting IDs', () => {
    expect(LEAD_ID_RE.test('txdot-I45-2026-001')).toBe(false);
  });
});

describe('LEAD_ID_RE — false positives blocked', () => {
  it('rejects plain uppercase words (SQL keywords)', () => {
    expect(LEAD_ID_RE.test('SELECT')).toBe(false);
    expect(LEAD_ID_RE.test('WHERE')).toBe(false);
    expect(LEAD_ID_RE.test('NULL')).toBe(false);
  });

  it('rejects lowercase identifiers', () => {
    expect(LEAD_ID_RE.test('my-variable')).toBe(false);
    expect(LEAD_ID_RE.test('console.log')).toBe(false);
  });

  it('rejects version strings without uppercase start', () => {
    expect(LEAD_ID_RE.test('v1.2.3')).toBe(false);
  });

  it('rejects plain numbers', () => {
    expect(LEAD_ID_RE.test('123456')).toBe(false);
    expect(LEAD_ID_RE.test('3.14')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(LEAD_ID_RE.test('')).toBe(false);
  });
});
