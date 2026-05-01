// __tests__/api/outreach/send.test.ts — Stream B Gate B2.
//
// Route handler for POST /api/outreach/send. Mocks lib/email/outreach-send
// and lib/supabase so the handler exercises validation + return shape
// without DB or HTTP.

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendOutreach = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

vi.mock('@/lib/email/outreach-send', () => ({
  sendOutreach: (...args: unknown[]) => mockSendOutreach(...args),
}));

import { POST } from '@/app/api/outreach/send/route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/pathfinder/api/outreach/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/outreach/send', () => {
  afterEach(() => {
    mockSendOutreach.mockReset();
  });

  it('rejects missing fields with 400', async () => {
    const res = await POST(makeReq({ project_id: 'p-1' }) as never);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/required|invalid_provider/);
  });

  it('rejects invalid provider', async () => {
    const res = await POST(
      makeReq({
        project_id: 'p-1',
        actor_email: 'rep@zedcor.com',
        provider: 'imap',
        recipient_email: 'r@x.com',
        draft_body: 'd',
        sent_body: 's',
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_provider');
  });

  it('returns 200 with ok=true on success', async () => {
    mockSendOutreach.mockResolvedValueOnce({
      ok: true,
      edit: {
        id: 'e-1',
        provider_message_id: 'msg-1',
        provider_thread_id: 'thread-1',
        edit_distance: 5,
      },
    });
    const res = await POST(
      makeReq({
        project_id: 'p-1',
        actor_email: 'rep@zedcor.com',
        provider: 'gmail',
        recipient_email: 'joe@vendor.com',
        draft_subject: 'Subj',
        draft_body: 'draft',
        sent_subject: 'Subj',
        sent_body: 'sent',
      }) as never,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; edit: { id: string } };
    expect(json.ok).toBe(true);
    expect(json.edit.id).toBe('e-1');
    expect(mockSendOutreach).toHaveBeenCalledTimes(1);
    const arg = mockSendOutreach.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.projectId).toBe('p-1');
    expect(arg.provider).toBe('gmail');
    expect(arg.draftBody).toBe('draft');
    expect(arg.sentBody).toBe('sent');
  });

  it('returns 412 when no integration exists', async () => {
    mockSendOutreach.mockResolvedValueOnce({
      ok: false,
      error: 'no_active_integration',
      edit: { id: 'e-2' },
    });
    const res = await POST(
      makeReq({
        project_id: 'p-2',
        actor_email: 'rep@zedcor.com',
        provider: 'gmail',
        recipient_email: 'joe@vendor.com',
        draft_body: 'd',
        sent_body: 's',
      }) as never,
    );
    expect(res.status).toBe(412);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('no_active_integration');
  });

  it('returns 200 ok=false when send failed but edit captured', async () => {
    mockSendOutreach.mockResolvedValueOnce({
      ok: false,
      error: 'gmail_send_failed: status=403',
      edit: { id: 'e-3', send_error: 'gmail_send_failed: status=403' },
    });
    const res = await POST(
      makeReq({
        project_id: 'p-3',
        actor_email: 'rep@zedcor.com',
        provider: 'gmail',
        recipient_email: 'joe@vendor.com',
        draft_body: 'd',
        sent_body: 's',
      }) as never,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; edit: { id: string } };
    expect(json.ok).toBe(false);
    expect(json.edit.id).toBe('e-3');
  });

  it('rejects empty sent_body', async () => {
    const res = await POST(
      makeReq({
        project_id: 'p-1',
        actor_email: 'rep@zedcor.com',
        provider: 'gmail',
        recipient_email: 'r@x.com',
        draft_body: 'd',
        sent_body: '',
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});
