// middleware.ts — basic-auth gate for the Pathfinder demo.
//
// Reads BASIC_AUTH_USER + BASIC_AUTH_PASS from env. On mismatch, returns 401 with
// `WWW-Authenticate: Basic realm="Pathfinder"`. Tracks attempts in a cookie; after
// 3 wrong attempts within 60s, returns 429 until the cookie expires.
//
// Gates everything except Next.js internals, favicon, and the Vercel `/_next/*`
// asset paths — pages AND API routes are protected, per the build brief.
//
// HOST PRESERVATION (don't break this):
// Pathfinder is served at www.unicron.systems/pathfinder via a server-side
// rewrite from the parent unicron-systems Next.js project. The browser's URL
// bar must stay on unicron.systems even though the actual server response
// comes from pathfinder-ashy.vercel.app. The middleware never calls
// `NextResponse.redirect()` — it only `next()`s through (success) or
// returns a 401/429 response (failure). Both are host-agnostic. If you
// ever need to redirect from this file, build the redirect URL from
// `request.headers.get('x-forwarded-host')` + `x-forwarded-proto`, NOT
// from `request.nextUrl` / `request.url` (those resolve to the Vercel
// deploy hostname when reverse-proxied and would leak it to the browser).

import { NextResponse, type NextRequest } from 'next/server';

const REALM = 'Pathfinder';
const ATTEMPT_COOKIE = 'pf_auth_attempts';
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

function denied(extraHeaders: Record<string, string> = {}) {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function rateLimited(extraHeaders: Record<string, string> = {}) {
  return new NextResponse('Too many attempts. Try again shortly.', {
    status: 429,
    headers: {
      'Retry-After': String(LOCKOUT_SECONDS),
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function decodeBasicHeader(header: string | null): { user: string; pass: string } | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return null;
  try {
    // atob is available in the edge runtime
    const decoded = atob(encoded);
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;

  // If creds aren't configured, fail closed in production but allow dev.
  if (!expectedUser || !expectedPass) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Auth not configured', { status: 503 });
    }
    return NextResponse.next();
  }

  // Rate-limit check via cookie
  const attemptsRaw = req.cookies.get(ATTEMPT_COOKIE)?.value;
  const attempts = attemptsRaw ? Number(attemptsRaw) : 0;
  if (Number.isFinite(attempts) && attempts >= MAX_ATTEMPTS) {
    return rateLimited();
  }

  const creds = decodeBasicHeader(req.headers.get('authorization'));
  const ok = creds?.user === expectedUser && creds?.pass === expectedPass;

  if (!ok) {
    const next = (Number.isFinite(attempts) ? attempts : 0) + 1;
    const res = denied();
    res.cookies.set({
      name: ATTEMPT_COOKIE,
      value: String(next),
      maxAge: LOCKOUT_SECONDS,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    return res;
  }

  // Authed — clear any attempt counter
  const res = NextResponse.next();
  if (attemptsRaw) {
    res.cookies.set({ name: ATTEMPT_COOKIE, value: '', maxAge: 0, path: '/' });
  }
  return res;
}

export const config = {
  // Gate everything except Next.js internals + favicon + cron endpoints. Pages and API routes both protected.
  // Two patterns because Next.js basePath strips the prefix before matching, and a single
  // `/.*` pattern can skip the bare basePath root in production. `/` covers the root case;
  // the lookahead pattern covers everything else.
  // `/api/cron/*` is excluded because Vercel cron jobs send `Authorization: Bearer ${CRON_SECRET}`
  // and the cron handler does its own auth — Basic auth would block the cron POST.
  // `/api/notifications/*` is excluded for the same reason — the test endpoint
  // verifies CRON_SECRET itself so we can curl from anywhere.
  // `/api/slack/install/callback` is excluded because Slack itself hits the redirect URL
  // without credentials; auth is via the OAuth `state` token + code exchange (see lib/slack/install.ts).
  // `/api/slack/events` and `/api/slack/actions` are excluded because Slack signs both
  // payloads with the signing secret (see lib/slack/bot.ts verifySlackSignature).
  // Note that `/api/slack/install/start` is NOT excluded — it's operator-only, gated.
  // `/api/inngest` is excluded because Inngest signs every PUT (function discovery)
  // and POST (event dispatch) with INNGEST_SIGNING_KEY; the `serve()` adapter from
  // `inngest/next` verifies the signature internally. Same pattern as the Slack
  // webhooks.
  // `/api/architect/` is excluded because Stream C's operator UI lives on a
  // separate origin (unicron-platform). The architect routes enforce their
  // own bearer-token auth via ARCHITECT_API_TOKEN — basic auth would block
  // the cross-origin operator UI fetches.
  // (The earlier `/api/dev/` exemption was removed in PR #32 alongside the
  // wrapper-probe route cleanup.)
  // `/api/email/oauth/callback` is excluded because Google / Microsoft hit
  // the redirect URL without basic-auth; auth is via the signed `state`
  // token + provider code exchange (see lib/email/oauth.ts). Same pattern
  // as the Slack OAuth callback.
  // `/api/email/webhooks/` is excluded because Gmail Pub/Sub + Microsoft
  // Graph subscription pushes arrive without basic-auth. Each handler
  // verifies its own auth (CRON_SECRET, validation token, clientState).
  matcher: [
    '/',
    '/((?!_next/|favicon\\.ico|api/cron/|api/notifications/|api/slack/install/callback|api/slack/events|api/slack/actions|api/inngest|api/architect/|api/email/oauth/callback|api/email/webhooks/).*)',
  ],
};
