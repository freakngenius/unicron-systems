// app/api/sources/onboard/route.ts — Phase 2 Stream E.
//
// Operator-driven entry point for the Source Onboarder.
//
// Synchronous mode (?sync=1) — runs the agent inline and returns the result.
// Used by Stream C's Add Source UI to render the live demo path.
//
// Asynchronous mode (default) — emits pathfinder/source.onboard.requested
// for Inngest to dispatch the agent in the background. Returns the request
// id so the UI can poll architect_sessions for streaming reasoning_log.
//
// API contract published in STREAM-README "API contract draft" section.

import { NextResponse } from 'next/server';
import { runSourceOnboarder } from '@/services/source-onboarder/agent';
import { inngest } from '@/lib/inngest/client';
import type { SourceOnboarderInput } from '@/services/source-onboarder/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // up to 5 min for sync runs; agent has its own 30-min internal cap

interface OnboardRequestBody {
  url?: string;
  description?: string;
  hint?: 'socrata' | 'rest' | 'rss' | 'json-dump';
  jurisdiction?: string;
  poll_frequency_seconds?: number;
  api_key_env?: string;
  created_by_user_email?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: OnboardRequestBody;
  try {
    body = (await req.json()) as OnboardRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.url && !body.description) {
    return NextResponse.json(
      { error: 'missing_input', detail: 'url or description is required' },
      { status: 400 },
    );
  }

  const inputs: SourceOnboarderInput = {
    kind: body.url ? 'url' : 'description',
    url: body.url,
    description: body.description,
    hint: body.hint,
    jurisdiction: body.jurisdiction,
    poll_frequency_seconds: body.poll_frequency_seconds,
    api_key_env: body.api_key_env,
    created_by_user_email: body.created_by_user_email,
  };

  const url = new URL(req.url);
  const sync = url.searchParams.get('sync') === '1';

  if (sync) {
    const result = await runSourceOnboarder({ inputs });
    return NextResponse.json({
      ok: result.outcome === 'live',
      source_id: result.source_id,
      adapter_kind: result.adapter_kind,
      schema: result.schema,
      status: outcomeToStatus(result.outcome),
      first_event_at: result.first_event_at,
      ticket_id: result.ticket_id,
      reason: result.reason,
      session_id: result.session_id,
      cost_usd: result.cost_usd,
      duration_ms: result.duration_ms,
    });
  }

  const requestId = crypto.randomUUID();
  await inngest.send({
    name: 'pathfinder/source.onboard.requested',
    data: { ...inputs, request_id: requestId },
  });
  return NextResponse.json({ status: 'queued', request_id: requestId });
}

function outcomeToStatus(outcome: string): 'live' | 'queued' | 'human-assist' | 'declined' {
  switch (outcome) {
    case 'live':
      return 'live';
    case 'human-assist':
      return 'human-assist';
    case 'declined':
      return 'declined';
    default:
      return 'queued';
  }
}
