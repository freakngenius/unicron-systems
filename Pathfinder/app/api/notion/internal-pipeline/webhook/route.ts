// POST /api/notion/internal-pipeline/webhook
//
// Stream G: receives Notion automation webhooks fired on Internal
// Pipeline Stage edits. Verifies the shared secret, looks up the deal
// id from the notion_pipeline_pages mapping, and calls moveDealStage
// with notionSyncSource='notion' so the on-update hook in lib/deals
// does NOT loop back to Notion.
//
// Notion automations send a JSON payload along these lines (Notion's
// automation webhook surface is intentionally flexible; the schema
// below is the contract we configure on the Notion side):
//
//   {
//     "page": { "id": "<notion-page-id>" },
//     "stage": "Contacted",       // the new Stage select option name
//     "actor": "kyle@..."         // optional
//   }
//
// HMAC: the operator sets NOTION_WEBHOOK_SECRET in Vercel; Notion's
// automation body is configured to include "secret": <value>. We do
// constant-time compare. This is intentionally simple; Notion does
// not expose a proper webhook-signing surface at this time.

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { isDealPipelineStage, moveDealStage } from '@/lib/deals';
import { findDealIdByNotionPage, notionStageToDeal, recordMapping } from '@/lib/notion/internal-pipeline';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface WebhookBody {
  page?: { id?: string } | null;
  stage?: string;
  secret?: string;
  actor?: string;
}

function constantTimeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const expected = process.env.NOTION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'webhook_secret_not_configured' }, { status: 503 });
  }

  let body: WebhookBody;
  try {
    body = (await req.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const provided = typeof body.secret === 'string' ? body.secret : '';
  if (!constantTimeCompare(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pageId = body.page?.id;
  if (!pageId || typeof pageId !== 'string') {
    return NextResponse.json({ error: 'page_id_required' }, { status: 400 });
  }

  const stageName = typeof body.stage === 'string' ? body.stage : '';
  const toStage = notionStageToDeal(stageName);
  if (!toStage || !isDealPipelineStage(toStage)) {
    return NextResponse.json({ error: 'invalid_stage', stage: stageName }, { status: 400 });
  }

  const dealId = await findDealIdByNotionPage(pageId);
  if (!dealId) {
    return NextResponse.json({ error: 'no_mapping_for_page', pageId }, { status: 404 });
  }

  try {
    const result = await moveDealStage({
      dealId,
      toStage,
      actorEmail: typeof body.actor === 'string' ? body.actor : null,
      payload: { source: 'notion', notion_page_id: pageId },
      notionSyncSource: 'notion',
    });
    // Refresh mapping last_synced_at so the app-side webhook does not
    // also re-write Notion on the next moveDealStage.
    await recordMapping(dealId, pageId, 'notion');
    return NextResponse.json({ ok: true, dealId, toStage, noop: result.noop });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
