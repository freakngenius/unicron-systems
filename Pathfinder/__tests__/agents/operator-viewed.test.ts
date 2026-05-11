// Phase 2E slice 4 — operator_viewed transition unit tests.

import { describe, expect, it } from 'vitest';
import { flipToOperatorViewed } from '@/lib/agents/operator-viewed';

interface CapturedUpdate {
  status: string;
  status_changed_at: string;
  filters: Array<{ col: string; value: unknown }>;
}

function makeMockClient(opts: { updateError?: { message: string } } = {}) {
  const captured: CapturedUpdate[] = [];
  return {
    captured,
    client: {
      from: (_table: string) => ({
        update: (v: { status: string; status_changed_at: string }) => {
          const filters: Array<{ col: string; value: unknown }> = [];
          const chain = {
            eq(col: string, value: unknown) {
              filters.push({ col, value });
              if (filters.length === 2) {
                captured.push({ ...v, filters });
                return Promise.resolve({ error: opts.updateError ?? null, data: null });
              }
              return chain;
            },
          };
          return chain;
        },
      }),
    } as unknown as Parameters<typeof flipToOperatorViewed>[2],
  };
}

describe('flipToOperatorViewed', () => {
  it('flips status ready_to_view → operator_viewed', async () => {
    const mock = makeMockClient();
    const result = await flipToOperatorViewed('org-1', 'ready_to_view', mock.client);
    expect(result.flipped).toBe(true);
    expect(result.previous_status).toBe('ready_to_view');
    expect(mock.captured).toHaveLength(1);
    expect(mock.captured[0].status).toBe('operator_viewed');
    // Includes the previous-status guard for race protection.
    expect(mock.captured[0].filters).toEqual(
      expect.arrayContaining([
        { col: 'id', value: 'org-1' },
        { col: 'status', value: 'ready_to_view' },
      ]),
    );
  });

  it('returns no-op (already_viewed) when org is already at operator_viewed', async () => {
    const mock = makeMockClient();
    const result = await flipToOperatorViewed('org-1', 'operator_viewed', mock.client);
    expect(result.flipped).toBe(false);
    expect(result.reason).toBe('already_viewed');
    expect(mock.captured).toHaveLength(0); // no DB call
  });

  it.each([
    ['setting_up'],
    ['first_run'],
    ['ranking'],
    ['awaiting_threshold'],
  ])('preserves status when current is %s (not_ready)', async (current) => {
    const mock = makeMockClient();
    const result = await flipToOperatorViewed('org-1', current, mock.client);
    expect(result.flipped).toBe(false);
    expect(result.reason).toBe('not_ready');
    expect(result.previous_status).toBe(current);
    expect(mock.captured).toHaveLength(0); // never writes
  });

  it('returns missing_org when status is null or undefined', async () => {
    const mock = makeMockClient();
    expect((await flipToOperatorViewed('org-1', null, mock.client)).reason).toBe('missing_org');
    expect((await flipToOperatorViewed('org-1', undefined, mock.client)).reason).toBe('missing_org');
  });

  it('returns update_failed when supabase errors out (best-effort, does not throw)', async () => {
    const mock = makeMockClient({ updateError: { message: 'transient supabase error' } });
    const result = await flipToOperatorViewed('org-1', 'ready_to_view', mock.client);
    expect(result.flipped).toBe(false);
    expect(result.reason).toBe('update_failed');
    expect(result.previous_status).toBe('ready_to_view');
  });
});
