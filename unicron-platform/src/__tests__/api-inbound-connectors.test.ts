// src/__tests__/api-inbound-connectors.test.ts
// Tests for the Calls Ingestion sprint Stream C5 connector skeletons:
//   api/inbound/plaud/calls.ts  — placeholder (no public API)
//   api/inbound/fathom/calls.ts — HMAC signature + tag filter
//   api/inbound/zoom/calls.ts   — URL validation handshake + Zoom signature

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

const ORIGINAL_FETCH = globalThis.fetch;

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

// Mock the inngest client so we don't hit the network.
vi.mock('../../lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['evt-1'] }) },
}));

const { default: plaudHandler } = await import('../../api/inbound/plaud/calls.ts' as string);
const { default: fathomHandler, __internals: fathomInternals } = await import('../../api/inbound/fathom/calls.ts' as string);
const { default: zoomHandler, __internals: zoomInternals } = await import('../../api/inbound/zoom/calls.ts' as string);

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeReq(opts: {
  method?: string;
  rawBody?: string;
  headers?: Record<string, string>;
} = {}) {
  const body = opts.rawBody ?? '{}';
  // Tiny Readable-stream stub that yields the body string then ends.
  return {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
    setEncoding(_enc: string) { return this; },
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === 'data') queueMicrotask(() => cb(body));
      if (event === 'end') queueMicrotask(() => cb());
      return this;
    },
  } as unknown as Parameters<typeof fathomHandler>[0];
}

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(c: number) { captured.status = c; return res; },
    json(b: unknown) { captured.body = b; return res; },
  } as Parameters<typeof fathomHandler>[1] & typeof captured;
  Object.defineProperty(res, 'captured', { get: () => captured });
  return res as typeof res & { captured: typeof captured };
}

beforeEach(() => {
  process.env.NOTION_TOKEN = 'ntn_test_token';
  process.env.NOTION_DB_CALL_TRANSCRIPTS = 'bd720f22aa1f40d3a9872f83c2a2d7a8';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.FATHOM_WEBHOOK_SECRET = 'fathom-secret';
  process.env.FATHOM_TAG_FILTER = 'unicron';
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = 'zoom-secret';
  process.env.ZOOM_HOST_EMAIL = 'kyle@unicron.systems';

  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: 'ledger-uuid', error: null });

  // Notion page-create success by default.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ id: 'notion-page-1', url: 'https://www.notion.so/page-1' }),
    text: async () => '{}',
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

// ─── Plaud ────────────────────────────────────────────────────────────────────

describe('plaud handler', () => {
  it('returns 501 with workaround text on POST', async () => {
    const res = makeRes();
    plaudHandler(makeReq({ method: 'POST' }), res);
    expect(res.captured.status).toBe(501);
    expect(JSON.stringify(res.captured.body)).toMatch(/manual upload/i);
  });

  it('returns 405 on non-POST methods', async () => {
    const res = makeRes();
    plaudHandler(makeReq({ method: 'GET' }), res);
    expect(res.captured.status).toBe(405);
  });
});

// ─── Fathom ───────────────────────────────────────────────────────────────────

function fathomSign(body: string): string {
  return createHmac('sha256', 'fathom-secret').update(body).digest('hex');
}

describe('fathom handler', () => {
  it('returns 503 when FATHOM_WEBHOOK_SECRET is unset (fails closed)', async () => {
    delete process.env.FATHOM_WEBHOOK_SECRET;
    const res = makeRes();
    await fathomHandler(makeReq({ rawBody: '{}', headers: { 'x-fathom-signature': 'sha256=abc' } }), res);
    expect(res.captured.status).toBe(503);
  });

  it('returns 401 when the signature is missing or invalid', async () => {
    const res = makeRes();
    await fathomHandler(
      makeReq({ rawBody: '{"tags":["unicron"]}', headers: { 'x-fathom-signature': 'sha256=deadbeef' } }),
      res,
    );
    expect(res.captured.status).toBe(401);
  });

  it('skips calls without the unicron tag and returns 202', async () => {
    const body = JSON.stringify({ tags: ['personal'], transcript: 'x' });
    const res = makeRes();
    await fathomHandler(
      makeReq({ rawBody: body, headers: { 'x-fathom-signature': fathomSign(body) } }),
      res,
    );
    expect(res.captured.status).toBe(202);
    expect((res.captured.body as { skipped?: boolean }).skipped).toBe(true);
  });

  it('returns 400 when the tagged call has no transcript', async () => {
    const body = JSON.stringify({ tags: ['unicron'], title: 'Unicron x Zedcor' });
    const res = makeRes();
    await fathomHandler(
      makeReq({ rawBody: body, headers: { 'x-fathom-signature': fathomSign(body) } }),
      res,
    );
    expect(res.captured.status).toBe(400);
  });

  it('ingests a tagged call with transcript and returns 200', async () => {
    const body = JSON.stringify({
      tags: ['unicron'],
      title: 'Unicron x Zedcor pilot',
      transcript: 'Kyle: hi. Jane: hello.',
      participants: ['Kyle', { name: 'Jane Doe' }],
      date: '2026-05-12',
    });
    const res = makeRes();
    await fathomHandler(
      makeReq({ rawBody: body, headers: { 'x-fathom-signature': fathomSign(body) } }),
      res,
    );
    expect(res.captured.status).toBe(200);
    expect(res.captured.body).toMatchObject({
      ok: true,
      notion_page_id: 'notion-page-1',
      ledger_id: 'ledger-uuid',
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'ns_create_call_transcript_ledger_row',
      expect.objectContaining({
        p_source: 'fathom',
        p_uploaded_by: 'fathom_webhook',
        p_participants: ['Kyle', 'Jane Doe'],
      }),
    );
  });

  it('extracts participant names from {name: ...} objects', async () => {
    const r = fathomInternals.getParticipants({
      participants: [{ name: 'A' }, 'B', { name: '' }, null, { name: 'C' }],
    } as Parameters<typeof fathomInternals.getParticipants>[0]);
    expect(r).toEqual(['A', 'B', 'C']);
  });
});

// ─── Zoom ─────────────────────────────────────────────────────────────────────

function zoomSign(body: string, ts: string): string {
  const msg = `v0:${ts}:${body}`;
  return `v0=${createHmac('sha256', 'zoom-secret').update(msg).digest('hex')}`;
}

describe('zoom handler', () => {
  it('returns 503 when ZOOM_WEBHOOK_SECRET_TOKEN is unset', async () => {
    delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    const res = makeRes();
    await zoomHandler(makeReq({ rawBody: '{}' }), res);
    expect(res.captured.status).toBe(503);
  });

  it('echoes the URL validation handshake without requiring signature', async () => {
    const body = JSON.stringify({
      event: 'endpoint.url_validation',
      payload: { plainToken: 'plain-abc' },
    });
    const res = makeRes();
    await zoomHandler(makeReq({ rawBody: body }), res);
    expect(res.captured.status).toBe(200);
    const result = res.captured.body as { plainToken: string; encryptedToken: string };
    expect(result.plainToken).toBe('plain-abc');
    // encryptedToken should be hex HMAC of plainToken with secret.
    const expected = createHmac('sha256', 'zoom-secret').update('plain-abc').digest('hex');
    expect(result.encryptedToken).toBe(expected);
  });

  it('returns 401 when the Zoom signature is invalid', async () => {
    const body = JSON.stringify({ event: 'recording.completed', payload: {} });
    const res = makeRes();
    await zoomHandler(
      makeReq({
        rawBody: body,
        headers: {
          'x-zm-signature': 'v0=deadbeef',
          'x-zm-request-timestamp': '1700000000',
        },
      }),
      res,
    );
    expect(res.captured.status).toBe(401);
  });

  it('skips recordings hosted by a different account', async () => {
    const ts = '1700000000';
    const body = JSON.stringify({
      event: 'recording.completed',
      payload: { object: { host_email: 'stranger@example.com', start_time: '2026-05-12T18:00:00Z' } },
    });
    const res = makeRes();
    await zoomHandler(
      makeReq({
        rawBody: body,
        headers: { 'x-zm-signature': zoomSign(body, ts), 'x-zm-request-timestamp': ts },
      }),
      res,
    );
    expect(res.captured.status).toBe(202);
    expect((res.captured.body as { skipped?: boolean }).skipped).toBe(true);
  });

  it('ingests a recording.completed event with inline transcript', async () => {
    const ts = '1700000000';
    const body = JSON.stringify({
      event: 'recording.completed',
      payload: {
        object: {
          host_email: 'kyle@unicron.systems',
          topic: 'Zedcor x Unicron sync',
          start_time: '2026-05-12T17:30:00Z',
          recording_files: [
            { file_type: 'MP4' },
            { file_type: 'TRANSCRIPT', transcript: 'Kyle: hi. Jane: hello.' },
          ],
        },
      },
    });
    const res = makeRes();
    await zoomHandler(
      makeReq({
        rawBody: body,
        headers: { 'x-zm-signature': zoomSign(body, ts), 'x-zm-request-timestamp': ts },
      }),
      res,
    );
    expect(res.captured.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      'ns_create_call_transcript_ledger_row',
      expect.objectContaining({
        p_source: 'zoom',
        p_uploaded_by: 'zoom_webhook',
        p_call_date: '2026-05-12',
      }),
    );
  });

  it('skips when recording.completed arrives without inline transcript', async () => {
    const ts = '1700000000';
    const body = JSON.stringify({
      event: 'recording.completed',
      payload: {
        object: {
          host_email: 'kyle@unicron.systems',
          start_time: '2026-05-12T17:30:00Z',
          recording_files: [{ file_type: 'MP4' }],
        },
      },
    });
    const res = makeRes();
    await zoomHandler(
      makeReq({
        rawBody: body,
        headers: { 'x-zm-signature': zoomSign(body, ts), 'x-zm-request-timestamp': ts },
      }),
      res,
    );
    expect(res.captured.status).toBe(202);
    expect((res.captured.body as { reason?: string }).reason).toMatch(/transcript/i);
  });

  it('verifyZoomSignature returns false when headers are missing', () => {
    expect(
      zoomInternals.verifyZoomSignature(
        { headers: {} } as Parameters<typeof zoomInternals.verifyZoomSignature>[0],
        '',
      ),
    ).toBe(false);
  });
});
