import { describe, expect, it } from 'vitest';

import { formatPostedDate } from '@/lib/posted-date';

const NOW = new Date('2026-05-02T12:00:00Z');

describe('formatPostedDate', () => {
  it('returns "—" / null for null input', () => {
    expect(formatPostedDate(null, NOW)).toEqual({ top: '—', subtitle: null });
  });

  it('returns "—" / null for malformed input', () => {
    expect(formatPostedDate('not-a-date', NOW)).toEqual({
      top: '—',
      subtitle: null,
    });
  });

  it('returns "Today" for same calendar day', () => {
    const r = formatPostedDate('2026-05-02', NOW);
    expect(r.top).toBe('Today');
    expect(r.subtitle).toBe('05-02-26');
  });

  it('returns "1 day ago" for one day prior', () => {
    expect(formatPostedDate('2026-05-01', NOW).top).toBe('1 day ago');
  });

  it('returns "X days ago" for older posts', () => {
    expect(formatPostedDate('2026-04-29', NOW).top).toBe('3 days ago');
  });

  it('formats subtitle as MM-DD-YY with zero padding', () => {
    expect(formatPostedDate('2026-01-05', NOW).subtitle).toBe('01-05-26');
  });

  it('handles ISO datetimes (truncates to date)', () => {
    const r = formatPostedDate('2026-04-29T16:30:00-04:00', NOW);
    expect(r.top).toBe('3 days ago');
    expect(r.subtitle).toBe('04-29-26');
  });

  it('handles future dates with "in N days"', () => {
    expect(formatPostedDate('2026-05-13', NOW).top).toBe('in 11 days');
  });
});
