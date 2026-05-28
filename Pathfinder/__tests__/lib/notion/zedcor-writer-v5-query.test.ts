// __tests__/lib/notion/zedcor-writer-v5-query.test.ts
//
// Sprint Z5.2 — regression smoke for the Notion SDK v5 migration. The
// production bug this guards against: zedcor-writer.ts previously called
// `client.databases.query({ database_id, ... })`, which @notionhq/client v5
// removed (`databases.{retrieve,create,update}` only; query moved to
// `dataSources.query({ data_source_id, ... })`).
//
// We intercept the *low-level* SupportedFetch hook the v5 Client takes —
// any real call must hit POST /v1/data_sources/{id}/query. If a regression
// puts the writer back on the v3 path, the request URL will say
// `/v1/databases/.../query` and the assertion fails.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const REAL_DATA_SOURCE_ID = '39b001e3-fa1f-4fbf-aeea-219d4ef2b19a';

interface CapturedRequest {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let captured: CapturedRequest[] = [];

beforeEach(() => {
  captured = [];
  process.env.NOTION_API_TOKEN = 'notion-test-token';
  process.env.ZEDCOR_NOTION_DB_ID = '856b43a02b4d43649344c5e1a05d206d';
  process.env.ZEDCOR_NOTION_DATA_SOURCE_ID = REAL_DATA_SOURCE_ID;
});

afterEach(() => {
  delete process.env.NOTION_API_TOKEN;
  delete process.env.ZEDCOR_NOTION_DB_ID;
  delete process.env.ZEDCOR_NOTION_DATA_SOURCE_ID;
});

async function loadWriterWithStubbedFetch(): Promise<typeof import('@/lib/notion/zedcor-writer')> {
  // Stub global fetch BEFORE the writer's @notionhq/client picks it up.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: unknown, init?: unknown): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as { url: string }).url;
    const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase();
    const rawBody = (init as { body?: string } | undefined)?.body;
    let body: Record<string, unknown> | null = null;
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try { body = JSON.parse(rawBody); } catch { body = null; }
    }
    captured.push({ url, method, body });
    // Always return "no existing page" for queries; "created" payload for create.
    if (url.includes('/data_sources/') && url.endsWith('/query')) {
      return new Response(JSON.stringify({ object: 'list', results: [], has_more: false, next_cursor: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/v1/pages') && method === 'POST') {
      return new Response(JSON.stringify({ object: 'page', id: 'created-page-id', url: 'https://notion.so/created', properties: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  // Defer-import the writer so it captures the stubbed fetch.
  const writer = await import('@/lib/notion/zedcor-writer');
  // Restore fetch in afterEach indirectly by exposing original via finalize.
  (writer as unknown as { __restoreFetch__: () => void }).__restoreFetch__ = () => {
    globalThis.fetch = originalFetch;
  };
  return writer;
}

describe('Notion SDK v5 migration (Z5.2)', () => {
  it('writeProjectToNotion routes the existence-check through /v1/data_sources/{id}/query (not /v1/databases/{id}/query)', async () => {
    const writer = await loadWriterWithStubbedFetch();
    try {
      await writer.writeProjectToNotion({
        source: 'galveston-county',
        source_id: 'rfp-test-26-001',
        title: 'V5 migration smoke test',
        posted_date: '2026-05-28',
        response_deadline: null,
        source_url: 'https://example.com/rfp',
        phase: 'open',
        agency: null,
        city: null,
        county: null,
        state: 'TX',
        estimated_value: null,
        rationale: null,
        score: null,
      });

      const queryReqs = captured.filter((r) => r.url.includes('/query'));
      expect(queryReqs.length).toBeGreaterThan(0);
      for (const req of queryReqs) {
        expect(req.url).toContain(`/v1/data_sources/${REAL_DATA_SOURCE_ID}/query`);
        expect(req.url).not.toMatch(/\/v1\/databases\/[^/]+\/query/);
      }
    } finally {
      (writer as unknown as { __restoreFetch__: () => void }).__restoreFetch__();
    }
  });
});
