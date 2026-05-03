// tests/user-connection.test.ts — Demo Polish UX Gate 9D.
//
// Smoke tests for the connection-resolution helpers used by the v2
// outreach surface. The integration with Supabase is covered manually
// during Gate 9E's production verification; here we cover the pure
// formatFromDisplay branch coverage.

import { describe, expect, it } from 'vitest';

import { formatFromDisplay } from '@/lib/outreach/user-connection';

describe('formatFromDisplay', () => {
  it('returns "Not connected" when conn is null', () => {
    expect(formatFromDisplay(null)).toBe('Not connected');
  });

  it('formats Gmail provider as "<email> via Gmail"', () => {
    expect(
      formatFromDisplay({
        user_id: 'kyle@freakngenius.com',
        provider: 'gmail',
        email: 'kyle@freakngenius.com',
        isConnected: true,
      }),
    ).toBe('kyle@freakngenius.com via Gmail');
  });

  it('formats Outlook provider as "<email> via Outlook"', () => {
    expect(
      formatFromDisplay({
        user_id: 'k@x.com',
        provider: 'outlook',
        email: 'kyle@zedcor.com',
        isConnected: true,
      }),
    ).toBe('kyle@zedcor.com via Outlook');
  });

  it('formats even when isConnected is false (token expired but row exists)', () => {
    expect(
      formatFromDisplay({
        user_id: 'a',
        provider: 'gmail',
        email: 'a@b.com',
        isConnected: false,
      }),
    ).toBe('a@b.com via Gmail');
  });
});
