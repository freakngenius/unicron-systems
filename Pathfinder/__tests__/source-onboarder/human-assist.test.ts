// __tests__/source-onboarder/human-assist.test.ts — Phase 2 Stream E, Gate E3.
//
// Ticket-lifecycle unit test. Mocks @/lib/supabase to inspect the row shape
// the createHumanAssistTicket tool writes.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => {
  const lastInsert: { value: Record<string, unknown> | null } = { value: null };
  return {
    supabaseAdmin: () => ({
      from: (_t: string) => ({
        insert: (rows: Record<string, unknown>[]) => {
          lastInsert.value = rows[0];
          return {
            select: () => ({
              single: async () => ({ data: { id: 'ticket-123' }, error: null }),
            }),
          };
        },
      }),
      __lastInsert: lastInsert,
    }),
  };
});

import { createHumanAssistTicket } from '@/services/source-onboarder/tools/human-assist';
import * as supabaseMod from '@/lib/supabase';

afterEach(() => vi.restoreAllMocks());

describe('createHumanAssistTicket', () => {
  it('writes ticket row with required columns and category=source-discovery default', async () => {
    const r = await createHumanAssistTicket({
      candidateUrl: 'https://nyc.gov/permits',
      blockedReason: 'js_rendering',
      blockedDetail: 'JS-rendered SPA detected',
      whatHumanNeedsToDo: 'Capture rendered HTML',
      partialProgress: { schema_inferred: { fields: { id: 'string' } } },
      agentSessionId: 'sess-1',
    });
    expect(r.ticketId).toBe('ticket-123');
    const inserted = (supabaseMod.supabaseAdmin() as unknown as { __lastInsert: { value: Record<string, unknown> } }).__lastInsert.value;
    expect(inserted.category).toBe('source-discovery');
    expect(inserted.blocked_reason).toBe('js_rendering');
    expect(inserted.title).toContain('nyc.gov');
    expect(inserted.status).toBe('open');
    const ctx = inserted.context as Record<string, unknown>;
    expect(ctx.candidate_url).toBe('https://nyc.gov/permits');
  });

  it('accepts coverage-expansion category override', async () => {
    await createHumanAssistTicket({
      candidateUrl: 'https://x',
      blockedReason: 'auth_required',
      blockedDetail: '',
      whatHumanNeedsToDo: '',
      category: 'coverage-expansion',
    });
    const inserted = (supabaseMod.supabaseAdmin() as unknown as { __lastInsert: { value: Record<string, unknown> } }).__lastInsert.value;
    expect(inserted.category).toBe('coverage-expansion');
  });
});
