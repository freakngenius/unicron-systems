// GET /api/email/oauth/callback?code=...&state=...
//
// Stream B Gate B2 — OAuth redirect target. Validates state, exchanges
// code for tokens, persists pathfinder.email_integrations, redirects
// the operator back to the lead detail view they came from (or settings
// fallback) with a query flag indicating success.

import { NextResponse, type NextRequest } from 'next/server';

import { completeOauth } from '@/lib/email/oauth';
import { publicUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorFromProvider = searchParams.get('error');

  if (errorFromProvider) {
    const target = new URL(`${publicUrl()}/settings`);
    target.searchParams.set('email_oauth', 'error');
    target.searchParams.set('detail', errorFromProvider);
    return NextResponse.redirect(target.toString(), { status: 302 });
  }

  if (!code) {
    return NextResponse.json({ error: 'code_required' }, { status: 400 });
  }

  try {
    const result = await completeOauth({ code, state });
    const target = new URL(`${publicUrl()}/settings`);
    target.searchParams.set('email_oauth', 'connected');
    target.searchParams.set('provider', result.integration.provider);
    target.searchParams.set('account', result.integration.account_email);
    return NextResponse.redirect(target.toString(), { status: 302 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (reason === 'invalid_state') {
      return NextResponse.json({ error: 'invalid_state' }, { status: 400 });
    }
    if (reason === 'cannot_resolve_account_email') {
      return NextResponse.json(
        { error: 'cannot_resolve_account_email', detail: 'token granted but mailbox unknown' },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'oauth_failed', detail: reason }, { status: 500 });
  }
}
