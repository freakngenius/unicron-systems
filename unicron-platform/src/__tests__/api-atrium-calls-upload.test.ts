// src/__tests__/api-atrium-calls-upload.test.ts
// Integration tests for POST /api/atrium/calls/upload (C3).
//
// Mocks @supabase/supabase-js for auth + RPC, and global fetch for the Notion
// API write inside createCallTranscriptPage.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}));

// Mock the inngest client so we don't make real network calls to Inngest Cloud.
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] });
vi.mock('../../lib/inngest/client', () => ({
  inngest: { send: mockInngestSend },
}));

const { default: uploadHandler } = await import('../../api/atrium/calls/upload.ts' as string);

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeReq(opts: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  return {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
    body: opts.body ?? {},
    query: {},
  } as Parameters<typeof uploadHandler>[0];
}

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(payload: unknown) { captured.body = payload; return res; },
  } as Parameters<typeof uploadHandler>[1] & typeof captured;
  Object.defineProperty(res, 'captured', { get: () => captured });
  return res as typeof res & { captured: typeof captured };
}

beforeEach(() => {
  process.env.ATRIUM_EMAIL_ALLOWLIST = 'kyle@unicron.systems,keenan@unicron.systems';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.NOTION_TOKEN = 'ntn_test_token';
  process.env.NOTION_DB_CALL_TRANSCRIPTS = 'bd720f22aa1f40d3a9872f83c2a2d7a8';

  mockGetUser.mockReset();
  mockRpc.mockReset();

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'notion-page-1', url: 'https://www.notion.so/page-1' }),
    text: async () => '{}',
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

// ─── Method + auth gates ──────────────────────────────────────────────────────

describe('method gate', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await uploadHandler(makeReq({ method: 'GET' }), res);
    expect(res.captured.status).toBe(405);
  });
});

describe('authorize()', () => {
  it('refuses when ATRIUM_EMAIL_ALLOWLIST is unset', async () => {
    delete process.env.ATRIUM_EMAIL_ALLOWLIST;
    const res = makeRes();
    await uploadHandler(makeReq({ headers: { authorization: 'Bearer x' } }), res);
    expect(res.captured.status).toBe(500);
  });

  it('returns 401 when bearer token is missing', async () => {
    const res = makeRes();
    await uploadHandler(makeReq({}), res);
    expect(res.captured.status).toBe(401);
  });

  it('returns 401 when supabase rejects the token', async () => {
    mockGetUser.mockResolvedValue({ data: null, error: { message: 'invalid' } });
    const res = makeRes();
    await uploadHandler(
      makeReq({ headers: { authorization: 'Bearer bad' } }),
      res,
    );
    expect(res.captured.status).toBe(401);
  });

  it('returns 403 when the resolved email is not on the allowlist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'stranger@example.com' } },
      error: null,
    });
    const res = makeRes();
    await uploadHandler(
      makeReq({ headers: { authorization: 'Bearer x' }, body: { summary_notes: 'x' } }),
      res,
    );
    expect(res.captured.status).toBe(403);
  });
});

// ─── Body validation ──────────────────────────────────────────────────────────

describe('parseUploadBody', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'kyle@unicron.systems' } },
      error: null,
    });
  });

  it('returns 400 when neither transcript nor summary_notes is provided', async () => {
    const res = makeRes();
    await uploadHandler(
      makeReq({ headers: { authorization: 'Bearer x' }, body: { participants: ['Kyle'] } }),
      res,
    );
    expect(res.captured.status).toBe(400);
    expect(JSON.stringify(res.captured.body)).toMatch(/transcript or summary_notes/);
  });

  it('coerces unknown source values to manual_upload', async () => {
    mockRpc.mockResolvedValue({ data: 'ledger-uuid', error: null });
    const res = makeRes();
    await uploadHandler(
      makeReq({
        headers: { authorization: 'Bearer x' },
        body: { summary_notes: 'x', source: 'evil_unknown_value' },
      }),
      res,
    );
    expect(res.captured.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      'ns_create_call_transcript_ledger_row',
      expect.objectContaining({ p_source: 'manual_upload' }),
    );
  });

  it('drops non-string participants entries and trims whitespace', async () => {
    mockRpc.mockResolvedValue({ data: 'ledger-uuid', error: null });
    const res = makeRes();
    await uploadHandler(
      makeReq({
        headers: { authorization: 'Bearer x' },
        body: {
          summary_notes: 'x',
          participants: ['  Kyle  ', 123, null, '', 'Jane Doe'],
        },
      }),
      res,
    );
    expect(res.captured.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      'ns_create_call_transcript_ledger_row',
      expect.objectContaining({ p_participants: ['Kyle', 'Jane Doe'] }),
    );
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('happy path', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'kyle@unicron.systems' } },
      error: null,
    });
  });

  it('creates a Notion page, writes a ledger row, and returns 200 with IDs', async () => {
    mockRpc.mockResolvedValue({ data: 'ledger-uuid-123', error: null });

    const res = makeRes();
    await uploadHandler(
      makeReq({
        headers: { authorization: 'Bearer x' },
        body: {
          transcript: 'Kyle: hello. Jane: hi.',
          summary_notes: 'Pilot kickoff.',
          date: '2026-05-12',
          participants: ['Kyle', 'Jane Doe'],
          source: 'manual_upload',
        },
      }),
      res,
    );

    expect(res.captured.status).toBe(200);
    expect(res.captured.body).toMatchObject({
      ok: true,
      notion_page_id: 'notion-page-1',
      notion_url: 'https://www.notion.so/page-1',
      ledger_id: 'ledger-uuid-123',
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith(
      'ns_create_call_transcript_ledger_row',
      expect.objectContaining({
        p_summary: 'Pilot kickoff.',
        p_content_full: 'Kyle: hello. Jane: hi.',
        p_participants: ['Kyle', 'Jane Doe'],
        p_notion_page_id: 'notion-page-1',
        p_notion_url: 'https://www.notion.so/page-1',
        p_source: 'manual_upload',
        p_call_date: '2026-05-12',
        p_uploaded_by: 'kyle@unicron.systems',
      }),
    );
  });
});

// ─── Failure modes ────────────────────────────────────────────────────────────

describe('failure modes', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'kyle@unicron.systems' } },
      error: null,
    });
  });

  it('returns 500 with Notion error when the Notion API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => '{"code":"unauthorized"}',
    }) as unknown as typeof fetch;

    const res = makeRes();
    await uploadHandler(
      makeReq({
        headers: { authorization: 'Bearer x' },
        body: { summary_notes: 'pilot kickoff' },
      }),
      res,
    );
    expect(res.captured.status).toBe(500);
    expect(JSON.stringify(res.captured.body)).toMatch(/Notion API 401/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 207 when Notion succeeds but the ledger insert fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed: connection lost' } });

    const res = makeRes();
    await uploadHandler(
      makeReq({
        headers: { authorization: 'Bearer x' },
        body: { summary_notes: 'pilot kickoff' },
      }),
      res,
    );
    expect(res.captured.status).toBe(207);
    expect(res.captured.body).toMatchObject({
      ok: false,
      notion_page_id: 'notion-page-1',
      notion_url: 'https://www.notion.so/page-1',
      ledger_error: expect.stringContaining('rpc failed'),
    });
  });
});
