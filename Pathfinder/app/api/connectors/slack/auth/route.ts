// GET /api/connectors/slack/auth?org_id=<org>
//
// OAuth start. Generates a signed state token, redirects the user to
// Slack's authorize URL. The callback route validates the state.
//
// AUTH: this is the operator's "Connect" click from the Settings tile;
// the middleware basic-auth gate covers it (the path is NOT exempted).
// Slack itself never hits this URL — only the callback is public.

import { NextResponse } from 'next/server';

import { buildState } from '@/lib/connectors/state';
import { buildAuthorizeUrl } from '@/lib/connectors/slack/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = (url.searchParams.get('org_id') ?? '').trim();
  if (!orgId) {
    return NextResponse.json({ ok: false, error: 'org_id required' }, { status: 400 });
  }

  let state: string;
  let authorize: string;
  try {
    state = buildState({ orgId, type: 'slack' });
    authorize = buildAuthorizeUrl(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
  return NextResponse.redirect(authorize, { status: 302 });
}
