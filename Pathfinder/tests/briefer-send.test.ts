// Unit tests for sendDailyBrief — integration lookup, send dispatch,
// outreach_sends row insertion. Test seams: getIntegration, sendImpl,
// db. No live Supabase; no real provider calls.

import { describe, expect, it, vi } from 'vitest';

import { sendDailyBrief } from '@/services/briefer/send';
import type { DailyBrief, EmailIntegration } from '@/lib/types';

function fakeBrief(): DailyBrief {
  return {
    subject: 'Pathfinder daily brief — 2026-05-04 — quiet day',
    markdown: '# Brief\n\nbody',
    html: '<h1>Brief</h1>',
    metrics: {
      new_leads_count: 0,
      follow_ups_count: 0,
      stage_changes_count: 0,
      replies_count: 0,
      contacts_pending_count: 0,
      llm_cost_usd: 0,
    },
    sections_rendered: [],
  };
}

function fakeGmailIntegration(over: Partial<EmailIntegration> = {}): EmailIntegration {
  return {
    id: 'int-1',
    actor_email: 'kyle@freakngenius.com',
    provider: 'gmail',
    account_email: 'kyle@freakngenius.com',
    access_token: 'tok-abc',
    refresh_token: 'ref-abc',
    token_expires_at: '2027-01-01T00:00:00Z',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    provider_meta: {},
    connected_at: '2026-05-01T00:00:00Z',
    disconnected_at: null,
    ...over,
  };
}

function makeFakeDb() {
  // Mock the .from('outreach_sends').insert(...).select('id').single()
  // chain. Records the inserted payload for assertions.
  const inserts: Array<Record<string, unknown>> = [];
  const errorPlanRef: { value: { message: string } | null } = { value: null };
  const fromImpl = (table: string) => ({
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return {
        select: () => ({
          single: async () =>
            errorPlanRef.value
              ? { data: null, error: errorPlanRef.value }
              : { data: { id: `row-${inserts.length}` }, error: null },
        }),
      };
    },
  });
  return { db: { from: fromImpl }, inserts, errorPlanRef };
}

describe('sendDailyBrief — happy path', () => {
  it('picks gmail integration, sends, and writes outreach_sends with type=briefing', async () => {
    const integration = fakeGmailIntegration();
    const fake = makeFakeDb();
    const sendImpl = vi.fn(async () => ({
      provider_message_id: 'msg-123',
      provider_thread_id: 'thr-456',
    }));

    const result = await sendDailyBrief({
      userId: integration.actor_email,
      brief: fakeBrief(),
      integration,
      sendImpl,
      db: fake.db,
    });

    expect(result).toEqual({
      ok: true,
      message_id: 'msg-123',
      error: null,
      outreach_send_id: 'row-1',
      provider: 'gmail',
    });

    // sendImpl called once with the integration's account_email as both
    // from + to and the brief's markdown as body.
    expect(sendImpl).toHaveBeenCalledTimes(1);
    expect(sendImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gmail',
        accessToken: 'tok-abc',
        fromEmail: 'kyle@freakngenius.com',
        toEmail: 'kyle@freakngenius.com',
        subject: expect.stringContaining('Pathfinder daily brief'),
        body: expect.stringContaining('# Brief'),
      }),
    );

    // outreach_sends row shape — type='briefing', project_id null,
    // status='sent', message_id captured.
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]).toEqual({
      table: 'outreach_sends',
      row: {
        type: 'briefing',
        project_id: null,
        user_id: 'kyle@freakngenius.com',
        to_email: 'kyle@freakngenius.com',
        subject: expect.stringContaining('Pathfinder daily brief'),
        body: expect.stringContaining('# Brief'),
        provider: 'gmail',
        message_id: 'msg-123',
        status: 'sent',
        error_message: null,
      },
    });
  });

  it('falls back to outlook when gmail is absent', async () => {
    const outlook = fakeGmailIntegration({
      provider: 'outlook',
      account_email: 'kyle@office.com',
    });
    const fake = makeFakeDb();
    const sendImpl = vi.fn(async () => ({
      provider_message_id: 'm',
      provider_thread_id: null,
    }));

    const getIntegration = vi.fn(async ({ provider }) =>
      provider === 'outlook' ? outlook : null,
    );

    const result = await sendDailyBrief({
      userId: 'kyle@freakngenius.com',
      brief: fakeBrief(),
      sendImpl,
      db: fake.db,
      getIntegration,
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('outlook');
    expect(getIntegration).toHaveBeenCalledWith({
      actorEmail: 'kyle@freakngenius.com',
      provider: 'gmail',
    });
    expect(getIntegration).toHaveBeenCalledWith({
      actorEmail: 'kyle@freakngenius.com',
      provider: 'outlook',
    });
  });
});

describe('sendDailyBrief — failure paths', () => {
  it('returns no_active_integration when no provider has an active token (no insert)', async () => {
    const fake = makeFakeDb();
    const sendImpl = vi.fn();
    const getIntegration = vi.fn(async () => null);
    const result = await sendDailyBrief({
      userId: 'kyle@freakngenius.com',
      brief: fakeBrief(),
      sendImpl,
      db: fake.db,
      getIntegration,
    });
    expect(result).toEqual({
      ok: false,
      message_id: null,
      error: 'no_active_integration',
      outreach_send_id: null,
      provider: null,
    });
    expect(sendImpl).not.toHaveBeenCalled();
    expect(fake.inserts).toHaveLength(0);
  });

  it('records a failed outreach_sends row when sendImpl throws', async () => {
    const integration = fakeGmailIntegration();
    const fake = makeFakeDb();
    const sendImpl = vi.fn(async () => {
      throw new Error('gmail_401');
    });
    const result = await sendDailyBrief({
      userId: integration.actor_email,
      brief: fakeBrief(),
      integration,
      sendImpl,
      db: fake.db,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('gmail_401');
    expect(result.message_id).toBeNull();
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]).toMatchObject({
      row: expect.objectContaining({
        type: 'briefing',
        status: 'failed',
        error_message: 'gmail_401',
        message_id: null,
      }),
    });
  });

  it('returns ok=true with outreach_send_id=null when the audit insert fails', async () => {
    // Send succeeded; logging the audit row failed (FK constraint, RLS
    // hiccup, etc.). We don't surface that as a send failure — the user
    // got their email. The cron's error counter still increments via
    // the null outreach_send_id observability hook.
    const integration = fakeGmailIntegration();
    const fake = makeFakeDb();
    fake.errorPlanRef.value = { message: 'unique_violation' };
    const result = await sendDailyBrief({
      userId: integration.actor_email,
      brief: fakeBrief(),
      integration,
      sendImpl: async () => ({ provider_message_id: 'msg-123', provider_thread_id: null }),
      db: fake.db,
    });
    expect(result.ok).toBe(true);
    expect(result.message_id).toBe('msg-123');
    expect(result.outreach_send_id).toBeNull();
  });
});
