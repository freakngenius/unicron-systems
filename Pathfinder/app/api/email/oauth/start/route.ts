// GET /api/email/oauth/start?provider=gmail&actor=rep@zedcor.com
//
// Stream B Gate B2 — operator-initiated OAuth start. Returns a 302 to
// the provider's authorize endpoint with a signed state token that the
// callback verifies. Fails with 503 when provider client credentials
// aren't configured (mirrors the Sonar SONAR_UNCONFIGURED degraded path).

import { NextResponse, type NextRequest } from 'next/server';

import { buildAuthorizeUrl, isEmailProvider } from '@/lib/email/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');
  const actor = searchParams.get('actor');

  if (!isEmailProvider(provider)) {
    return NextResponse.json(
      { error: 'invalid_provider', detail: 'provider must be gmail or outlook' },
      { status: 400 },
    );
  }
  if (!actor || typeof actor !== 'string') {
    return NextResponse.json({ error: 'actor_required' }, { status: 400 });
  }

  try {
    const { url } = buildAuthorizeUrl({ provider, actorEmail: actor });
    return NextResponse.redirect(url, { status: 302 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (/CLIENT_ID is not set|not configured|disabled/i.test(reason)) {
      return NextResponse.json(
        { error: 'provider_not_configured', detail: reason },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
