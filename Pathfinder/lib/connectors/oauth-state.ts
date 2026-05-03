// lib/connectors/oauth-state.ts — signed + timestamped OAuth state tokens.
//
// SPEC § 5.3: state tokens MUST be signed, expiring, and replay-resistant.
// We use a compact custom JWT-shaped HMAC token instead of a real JWT lib
// because the dependency surface is already heavy and HMAC-SHA256 of a
// JSON payload is the same primitive a JWT lib would call into.
//
// Token shape: base64url(header) . base64url(payload) . base64url(sig)
// where sig = HMAC_SHA256(secret, header + '.' + payload).
//
// Payload fields:
//   org_id         (string)  - customer org issuing the OAuth flow
//   connector_type (string)  - slack|teams|hubspot, must match the route
//   nonce          (string)  - 16 random bytes hex; never reused
//   iat            (int)     - issued-at unix ms
//   exp            (int)     - expiry unix ms (10 min from iat per spec)
//
// Replay defense: callers MUST track consumed nonces in a short-lived
// store (Phase 1 uses an in-memory Set scoped to the lambda — fine for
// the single-Vercel-region deployment; multi-region would need Redis).
// The oauth-state module owns the nonce set; the GET handler issues
// the nonce and the callback consumes it.

import crypto from 'node:crypto';

import type { ConnectorType } from './types';

interface StatePayload {
  org_id: string;
  connector_type: ConnectorType;
  nonce: string;
  iat: number;
  exp: number;
  /** Set on user-level OAuth flows (Gate 10B HubSpot per-user connect).
   *  Org-level Slack/Teams flows omit this. The validator surfaces it
   *  back so the callback can write user_connections rows scoped to the
   *  same operator that initiated the install. */
  user_id?: string;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    throw new Error(
      'CONNECTOR_OAUTH_STATE_SECRET (or CRON_SECRET fallback) is required to sign OAuth state tokens',
    );
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(input: string): Buffer {
  // pad back to multiple of 4
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const std = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(std, 'base64');
}

function sign(headerPayload: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(headerPayload).digest());
}

// In-memory nonce store. Each lambda invocation gets its own copy; nonce
// reuse across cold starts is theoretically possible but the 10-minute
// expiry bounds the attack window. For Phase 2 swap to Upstash Redis.
const consumedNonces = new Map<string, number>();
const NONCE_TTL_MS = 15 * 60 * 1000;

function purgeExpiredNonces(now: number): void {
  for (const [nonce, expiresAt] of consumedNonces.entries()) {
    if (expiresAt <= now) consumedNonces.delete(nonce);
  }
}

export interface IssueOptions {
  org_id: string;
  connector_type: ConnectorType;
  /** Override clock for tests. */
  now?: number;
  /** Override TTL for tests. */
  ttlMs?: number;
  /** User-level OAuth flows pass the operator email here so the callback
   *  can write a user_connections row scoped to the right user. Optional
   *  to keep the org-level Slack/Teams flow signature unchanged. */
  user_id?: string;
}

/** Issue a fresh signed state token for an OAuth start. */
export function issueState(opts: IssueOptions): string {
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? TEN_MINUTES_MS;
  const payload: StatePayload = {
    org_id: opts.org_id,
    connector_type: opts.connector_type,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + ttl,
    ...(opts.user_id ? { user_id: opts.user_id } : {}),
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'CONNECTOR_STATE' }));
  const body = b64url(JSON.stringify(payload));
  const signing = `${header}.${body}`;
  const sig = sign(signing, getSecret());
  return `${signing}.${sig}`;
}

export type ValidateResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'replayed' | 'type_mismatch' };

export interface ValidateOptions {
  /** Connector type the callback route expects. Must match payload. */
  expectedType: ConnectorType;
  /** Override clock for tests. */
  now?: number;
  /** When true, do NOT mark the nonce as consumed. Used by tests. */
  peek?: boolean;
}

/** Validate a state token returned by the OAuth provider. Returns
 *  `{ ok: true }` when the token is signed, unexpired, type-matches, and
 *  hasn't been consumed yet. Side-effect: marks the nonce as consumed
 *  so the same token cannot be replayed. */
export function validateState(token: string, opts: ValidateOptions): ValidateResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, body, sig] = parts;

  const expected = sign(`${header}.${body}`, getSecret());
  // Constant-time compare.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let parsed: StatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(body).toString('utf8')) as StatePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof parsed.org_id !== 'string' ||
    typeof parsed.connector_type !== 'string' ||
    typeof parsed.nonce !== 'string' ||
    typeof parsed.iat !== 'number' ||
    typeof parsed.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (parsed.connector_type !== opts.expectedType) {
    return { ok: false, reason: 'type_mismatch' };
  }
  const now = opts.now ?? Date.now();
  if (parsed.exp <= now) return { ok: false, reason: 'expired' };

  purgeExpiredNonces(now);
  if (consumedNonces.has(parsed.nonce)) {
    return { ok: false, reason: 'replayed' };
  }
  if (!opts.peek) {
    consumedNonces.set(parsed.nonce, now + NONCE_TTL_MS);
  }
  return { ok: true, payload: parsed };
}

/** Test seam — drop all consumed nonces. */
export function __resetNonceStoreForTests(): void {
  consumedNonces.clear();
}
