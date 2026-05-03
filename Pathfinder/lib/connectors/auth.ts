// lib/connectors/auth.ts — operator gating for connector API routes.
//
// The connector API surface is destructive (revoke tokens, mutate routing
// rules, fire test events) so it is gated to OPERATOR_EMAILS in addition
// to the basic-auth wall the rest of /pathfinder sits behind. The check
// pattern mirrors `app/api/me/route.ts`: an operator's email is sent in
// either an `x-operator-email` request header (set by the settings UI
// from localStorage) or the `?operator_email=` query parameter (handy for
// curl / smoke tests).
//
// This is demo-grade — the real boundary is the basic-auth middleware +
// service-role-only Supabase access. OPERATOR_EMAILS just splits internal
// from customer inside an authed session.

import { type NextRequest } from 'next/server';

function operatorAllowlist(): string[] {
  const raw = process.env.OPERATOR_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Returns the operator email for this request if the caller is an
 * operator, or `null` otherwise. Routes should 403 on null.
 */
export function getOperatorEmail(req: NextRequest): string | null {
  const headerEmail = req.headers.get('x-operator-email');
  const url = new URL(req.url);
  const queryEmail = url.searchParams.get('operator_email');
  const candidate = (headerEmail ?? queryEmail ?? '').trim().toLowerCase();
  if (!candidate) return null;
  const allow = operatorAllowlist();
  if (!allow.includes(candidate)) return null;
  return candidate;
}

/**
 * Convenience check — true when the caller is an operator. The route
 * handler is responsible for returning the 403; this helper just owns
 * the lookup logic.
 */
export function isOperatorRequest(req: NextRequest): boolean {
  return getOperatorEmail(req) !== null;
}

// V1 hardcodes the org for Zedcor's pilot. Multi-tenant routing flips
// this to a request-scoped lookup (header or session). Keeping the
// constant name `DEFAULT_ORG_ID` so the swap point is greppable.
export const DEFAULT_ORG_ID = 'zedcor';

/**
 * Read the per-user identity for the current request. v1 returns the
 * operator email (basic-auth principal) since real Auth tables don't
 * exist yet — keep the API on `text user_id` to align with
 * `pathfinder.user_connections.user_id` which Gate 9D shipped as text.
 *
 * Returns null when the caller is not an operator (route should 401/403).
 * Gate 10B's HubSpot install/callback/disconnect routes rely on this
 * to scope OAuth grants to the right user_connections row.
 */
export function getCurrentUserId(req: NextRequest): string | null {
  // Today: 1:1 with operator email. Future-uuid migration flips this
  // to a session lookup; the rest of the codebase reads through this
  // helper so the swap point stays single-source.
  return getOperatorEmail(req);
}

/**
 * Read the customer org id for this request. v1 returns DEFAULT_ORG_ID
 * unless an explicit override is sent via header/query — operators use
 * that to inspect another tenant's connectors. Customers (non-operators)
 * are always pinned to DEFAULT_ORG_ID.
 */
export function resolveOrgId(req: NextRequest): string {
  if (!isOperatorRequest(req)) return DEFAULT_ORG_ID;
  const fromHeader = req.headers.get('x-org-id');
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('org_id');
  const candidate = (fromHeader ?? fromQuery ?? '').trim();
  if (!candidate) return DEFAULT_ORG_ID;
  // Whitelist character set — defense against header-injection.
  if (!/^[a-z0-9_-]{1,64}$/i.test(candidate)) return DEFAULT_ORG_ID;
  return candidate;
}
