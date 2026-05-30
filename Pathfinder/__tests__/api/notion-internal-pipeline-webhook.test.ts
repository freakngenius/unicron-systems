// __tests__/api/notion-internal-pipeline-webhook.test.ts, Stream G.
//
// Tests the webhook receiver's secret check and stage-name validation.
// The Supabase mapping lookup and moveDealStage call are mocked so the
// test does not touch a real database.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const moveDealStage = vi.fn();
const findDealIdByNotionPage = vi.fn();
const recordMapping = vi.fn();

vi.mock('@/lib/deals', () => ({
  isDealPipelineStage: (v: unknown) =>
    typeof v === 'string' && ['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'WON', 'LOST'].includes(v),
  moveDealStage: (...args: unknown[]) => moveDealStage(...args),
}));

vi.mock('@/lib/notion/internal-pipeline', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    findDealIdByNotionPage: (...args: unknown[]) => findDealIdByNotionPage(...args),
    recordMapping: (...args: unknown[]) => recordMapping(...args),
  };
});

// Tiny shim that mimics NextRequest.json() / NextResponse.json() for the
// route handler. The handler reads `req.json()` and writes via
// NextResponse, so a minimal mock is enough.
function jsonRequest(body: unknown): { json: () => Promise<unknown> } {
  return { json: () => Promise.resolve(body) };
}

async function callPost(body: unknown): Promise<{ status: number; payload: unknown }> {
  const mod = await import('@/app/api/notion/internal-pipeline/webhook/route');
  const res = await mod.POST(jsonRequest(body) as unknown as Parameters<typeof mod.POST>[0]);
  // NextResponse.json returns a Response; read it back.
  return {
    status: (res as Response).status,
    payload: await (res as Response).json(),
  };
}

describe('POST /api/notion/internal-pipeline/webhook', () => {
  const ORIGINAL_SECRET = process.env.NOTION_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.NOTION_WEBHOOK_SECRET = 'unit-test-secret';
    moveDealStage.mockReset();
    findDealIdByNotionPage.mockReset();
    recordMapping.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.NOTION_WEBHOOK_SECRET;
    else process.env.NOTION_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it('503 when NOTION_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.NOTION_WEBHOOK_SECRET;
    const { status, payload } = await callPost({ secret: 'x' });
    expect(status).toBe(503);
    expect(payload).toEqual({ error: 'webhook_secret_not_configured' });
  });

  it('401 when the secret does not match', async () => {
    const { status, payload } = await callPost({ secret: 'wrong', page: { id: 'p' }, stage: 'Contacted' });
    expect(status).toBe(401);
    expect(payload).toEqual({ error: 'unauthorized' });
  });

  it('400 when page.id is missing', async () => {
    const { status, payload } = await callPost({ secret: 'unit-test-secret', stage: 'Contacted' });
    expect(status).toBe(400);
    expect(payload).toEqual({ error: 'page_id_required' });
  });

  it('400 when stage is not one of the seven option names', async () => {
    const { status, payload } = await callPost({
      secret: 'unit-test-secret',
      page: { id: 'page-x' },
      stage: 'Something Else',
    });
    expect(status).toBe(400);
    expect(payload).toMatchObject({ error: 'invalid_stage' });
  });

  it('404 when no mapping exists for the page id', async () => {
    findDealIdByNotionPage.mockResolvedValueOnce(null);
    const { status, payload } = await callPost({
      secret: 'unit-test-secret',
      page: { id: 'page-unknown' },
      stage: 'Contacted',
    });
    expect(status).toBe(404);
    expect(payload).toMatchObject({ error: 'no_mapping_for_page' });
  });

  it('200 path: looks up the deal, calls moveDealStage with notionSyncSource=notion, refreshes mapping', async () => {
    findDealIdByNotionPage.mockResolvedValueOnce('deal-uuid-9');
    moveDealStage.mockResolvedValueOnce({ noop: false, deal: { id: 'deal-uuid-9' } });
    recordMapping.mockResolvedValueOnce(undefined);

    const { status, payload } = await callPost({
      secret: 'unit-test-secret',
      page: { id: 'page-uuid-9' },
      stage: 'In Conversation',
      actor: 'kyle@example.com',
    });

    expect(status).toBe(200);
    expect(payload).toMatchObject({ ok: true, dealId: 'deal-uuid-9', toStage: 'REPLIED', noop: false });
    expect(moveDealStage).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: 'deal-uuid-9',
        toStage: 'REPLIED',
        actorEmail: 'kyle@example.com',
        notionSyncSource: 'notion',
      }),
    );
    expect(recordMapping).toHaveBeenCalledWith('deal-uuid-9', 'page-uuid-9', 'notion');
  });
});
