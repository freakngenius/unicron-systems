// Unit tests for the Gate 19 stage normalization helper
// (Pathfinder/lib/leads/stage-normalize.ts).
//
// Verifies the seven distinct DB values (solicitation, RFP, pre-budget,
// PRE, PLN, NWS, awarded) collapse into the six normalized buckets per
// the Gate 19 dispatch.

import { describe, it, expect } from 'vitest';
import {
  normalizeStage,
  STAGE_NORMALIZED_ORDER,
  STAGE_LABELS,
  BID_WINDOW_DIVIDER_INDEX,
} from '@/lib/leads/stage-normalize';

describe('normalizeStage', () => {
  it('collapses solicitation + RFP into rfp_open', () => {
    expect(normalizeStage('solicitation')).toBe('rfp_open');
    expect(normalizeStage('RFP')).toBe('rfp_open');
    expect(normalizeStage('rfp')).toBe('rfp_open');
    expect(normalizeStage('RFP open')).toBe('rfp_open');
  });

  it('maps pre-budget to pre_budget', () => {
    expect(normalizeStage('pre-budget')).toBe('pre_budget');
    expect(normalizeStage('pre_budget')).toBe('pre_budget');
  });

  it('maps PRE to pre_bid (distinct from pre_budget)', () => {
    expect(normalizeStage('PRE')).toBe('pre_bid');
    expect(normalizeStage('pre')).toBe('pre_bid');
    expect(normalizeStage('pre-bid')).toBe('pre_bid');
  });

  it('maps PLN to planning', () => {
    expect(normalizeStage('PLN')).toBe('planning');
    expect(normalizeStage('Planning')).toBe('planning');
  });

  it('maps NWS to news_mention', () => {
    expect(normalizeStage('NWS')).toBe('news_mention');
    expect(normalizeStage('news mention')).toBe('news_mention');
    expect(normalizeStage('news')).toBe('news_mention');
  });

  it('maps awarded variants to awarded', () => {
    expect(normalizeStage('awarded')).toBe('awarded');
    expect(normalizeStage('contract awarded')).toBe('awarded');
    expect(normalizeStage('AWARDED')).toBe('awarded');
  });

  it('returns null for unrecognized values, including null/empty', () => {
    expect(normalizeStage(null)).toBeNull();
    expect(normalizeStage('')).toBeNull();
    expect(normalizeStage('   ')).toBeNull();
    expect(normalizeStage('something-else')).toBeNull();
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeStage('  RFP  ')).toBe('rfp_open');
    expect(normalizeStage('Awarded')).toBe('awarded');
  });
});

describe('STAGE_NORMALIZED_ORDER', () => {
  it('lists stages earliest to latest with awarded last', () => {
    expect(STAGE_NORMALIZED_ORDER).toEqual([
      'news_mention',
      'planning',
      'pre_budget',
      'pre_bid',
      'rfp_open',
      'awarded',
    ]);
  });

  it('has a label for every stage', () => {
    for (const s of STAGE_NORMALIZED_ORDER) {
      expect(STAGE_LABELS[s]).toBeTruthy();
    }
  });

  it('positions the bid-window divider before awarded', () => {
    expect(STAGE_NORMALIZED_ORDER[BID_WINDOW_DIVIDER_INDEX]).toBe('awarded');
  });
});
