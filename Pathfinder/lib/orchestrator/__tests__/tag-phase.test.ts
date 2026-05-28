// lib/orchestrator/__tests__/tag-phase.test.ts
import { describe, expect, it } from 'vitest';
import { tagPhase, tagPhaseWithConfidence } from '../tag-phase';

const NOW = new Date('2026-05-27T12:00:00Z').getTime();
const day = 86_400_000;

describe('tagPhase (deterministic date-based)', () => {
  it("returns 'awarded' when the deadline has passed", () => {
    expect(tagPhase({ response_deadline: '2026-05-26' }, NOW)).toBe('awarded');
  });

  it("returns 'closing-soon' when the deadline is within 7 days", () => {
    expect(tagPhase({ response_deadline: new Date(NOW + 3 * day) }, NOW)).toBe('closing-soon');
    expect(tagPhase({ response_deadline: new Date(NOW + 7 * day) }, NOW)).toBe('closing-soon');
  });

  it("returns 'open' when the deadline is more than 7 days out", () => {
    expect(tagPhase({ response_deadline: new Date(NOW + 8 * day) }, NOW)).toBe('open');
    expect(tagPhase({ response_deadline: new Date(NOW + 60 * day) }, NOW)).toBe('open');
  });

  it("returns 'open' when posted but no deadline is parseable", () => {
    expect(tagPhase({ posted_date: '2026-05-20', response_deadline: null }, NOW)).toBe('open');
  });

  it("returns 'unknown' when neither date is parseable", () => {
    expect(tagPhase({}, NOW)).toBe('unknown');
    expect(tagPhase({ response_deadline: null, posted_date: null }, NOW)).toBe('unknown');
    expect(tagPhase({ response_deadline: 'not-a-date' as unknown as string }, NOW)).toBe('unknown');
  });

  it('exposes phase + confidence via tagPhaseWithConfidence', () => {
    expect(tagPhaseWithConfidence({ response_deadline: new Date(NOW + 3 * day) }, NOW)).toEqual({
      phase: 'closing-soon',
      phase_confidence: 1,
    });
    expect(tagPhaseWithConfidence({}, NOW)).toEqual({ phase: 'unknown', phase_confidence: 0 });
  });
});
