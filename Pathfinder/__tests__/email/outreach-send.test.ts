// __tests__/email/outreach-send.test.ts — Stream B Gate B2.
//
// Tests the orchestrator: sendOutreach reads the integration, calls the
// provider, captures the edit. Mocks lib/email/integrations + lib/email/send
// + lib/supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetIntegration = vi.fn();
const mockSendEmail = vi.fn();
const mockInsertSingle = vi.fn();
let lastInsertRow: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        lastInsertRow = row;
        return {
          select: () => ({ single: () => mockInsertSingle() }),
        };
      },
    }),
  }),
}));

vi.mock('@/lib/email/integrations', () => ({
  getActiveIntegration: (...args: unknown[]) => mockGetIntegration(...args),
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import { sendOutreach } from '@/lib/email/outreach-send';

describe('sendOutreach', () => {
  beforeEach(() => {
    mockGetIntegration.mockReset();
    mockSendEmail.mockReset();
    mockInsertSingle.mockReset();
    lastInsertRow = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes outreach_edits with no_active_integration when not connected', async () => {
    mockGetIntegration.mockResolvedValueOnce(null);
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'e-1', send_error: 'no_active_integration' },
      error: null,
    });

    const r = await sendOutreach({
      projectId: 'p-1',
      actorEmail: 'rep@zedcor.com',
      provider: 'gmail',
      draftSubject: 'Subj',
      draftBody: 'draft',
      sentSubject: 'Subj',
      sentBody: 'sent',
      recipientEmail: 'joe@vendor.com',
    });

    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_active_integration');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(lastInsertRow?.send_error).toBe('no_active_integration');
    expect(lastInsertRow?.sent_at).toBeNull();
  });

  it('records provider IDs + sent_at on success', async () => {
    mockGetIntegration.mockResolvedValueOnce({
      id: 'integ-1',
      access_token: 'tok',
      account_email: 'rep@zedcor.com',
    });
    mockSendEmail.mockResolvedValueOnce({
      provider_message_id: 'm-1',
      provider_thread_id: 't-1',
    });
    mockInsertSingle.mockResolvedValueOnce({
      data: {
        id: 'e-2',
        provider_message_id: 'm-1',
        provider_thread_id: 't-1',
        edit_distance: 4,
      },
      error: null,
    });

    const r = await sendOutreach({
      projectId: 'p-2',
      actorEmail: 'rep@zedcor.com',
      provider: 'gmail',
      draftSubject: 'Subj',
      draftBody: 'Hello world.',
      sentSubject: 'Subj',
      sentBody: 'Hello, world.', // 1-char insertion
      recipientEmail: 'joe@vendor.com',
    });

    expect(r.ok).toBe(true);
    expect(r.edit.id).toBe('e-2');
    expect(lastInsertRow?.provider_message_id).toBe('m-1');
    expect(lastInsertRow?.provider_thread_id).toBe('t-1');
    expect(lastInsertRow?.send_error).toBeNull();
    expect(lastInsertRow?.sent_at).not.toBeNull();
    expect(lastInsertRow?.edit_distance).toBeGreaterThan(0);
    const summary = lastInsertRow?.edit_summary as Record<string, unknown>;
    expect(summary.edit_band).toMatch(/minor|moderate/);
  });

  it('records send_error when provider throws, with sent_at null', async () => {
    mockGetIntegration.mockResolvedValueOnce({
      id: 'integ-1',
      access_token: 'tok',
      account_email: 'rep@zedcor.com',
    });
    mockSendEmail.mockRejectedValueOnce(new Error('gmail_send_failed: status=403'));
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'e-3', send_error: 'gmail_send_failed: status=403' },
      error: null,
    });

    const r = await sendOutreach({
      projectId: 'p-3',
      actorEmail: 'rep@zedcor.com',
      provider: 'gmail',
      draftSubject: 'Subj',
      draftBody: 'd',
      sentSubject: 'Subj',
      sentBody: 's',
      recipientEmail: 'joe@vendor.com',
    });

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gmail_send_failed/);
    expect(lastInsertRow?.send_error).toMatch(/gmail_send_failed/);
    expect(lastInsertRow?.sent_at).toBeNull();
    expect(lastInsertRow?.provider_message_id).toBeNull();
  });

  it('captures unchanged when sent equals draft', async () => {
    mockGetIntegration.mockResolvedValueOnce({
      id: 'integ-1',
      access_token: 'tok',
      account_email: 'rep@zedcor.com',
    });
    mockSendEmail.mockResolvedValueOnce({
      provider_message_id: 'm-4',
      provider_thread_id: 't-4',
    });
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'e-4', edit_distance: 0 },
      error: null,
    });

    const draft = 'Identical body.';
    await sendOutreach({
      projectId: 'p-4',
      actorEmail: 'rep@zedcor.com',
      provider: 'gmail',
      draftSubject: 'Subj',
      draftBody: draft,
      sentSubject: 'Subj',
      sentBody: draft,
      recipientEmail: 'joe@vendor.com',
    });

    expect(lastInsertRow?.edit_distance).toBe(0);
    const summary = lastInsertRow?.edit_summary as Record<string, unknown>;
    expect(summary.unchanged).toBe(true);
    expect(summary.edit_band).toBe('unchanged');
  });
});
