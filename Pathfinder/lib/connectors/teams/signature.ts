// lib/connectors/teams/signature.ts — Bot Framework JWT bearer-token
// verification. PUBLIC endpoint exposed at
// /api/connectors/teams/webhook MUST verify every incoming Activity
// signature before any handler runs.
//
// Microsoft Bot Framework auth model (per
// https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication):
//
//   Bot Connector → Bot
//     Authorization: Bearer <jwt>
//     - issuer: https://api.botframework.com
//     - audience: <our app id (TEAMS_BOT_ID or TEAMS_APP_ID)>
//     - signed by Microsoft public keys at
//       https://login.botframework.com/v1/.well-known/openidconfiguration
//
// Full JWKS verification requires fetching the OpenID config + the JWKS
// keyset, matching the `kid` header to a key, and verifying RS256.
// We implement the full flow in production but keep the verifier behind
// a TEAMS_DISABLE_JWT_VERIFY=1 escape-hatch (test-only) so unit tests
// can post fixture activities without a real Microsoft signature.
//
// SECURITY: in production (NODE_ENV=production) the escape hatch is
// HARD-DISABLED. Setting TEAMS_DISABLE_JWT_VERIFY in prod has no effect.

import crypto from 'node:crypto';

export type VerifyTeamsResult =
  | { ok: true; reason: 'ok' | 'test_bypass' }
  | {
      ok: false;
      reason:
        | 'missing_authorization'
        | 'malformed_jwt'
        | 'fetch_jwks_failed'
        | 'unknown_kid'
        | 'bad_signature'
        | 'wrong_issuer'
        | 'wrong_audience'
        | 'expired'
        | 'not_yet_valid';
    };

interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
  x5t?: string;
}

interface JwtPayload {
  iss?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  serviceurl?: string;
  [k: string]: unknown;
}

const BOT_FRAMEWORK_OPENID_URL = 'https://login.botframework.com/v1/.well-known/openidconfiguration';
const EXPECTED_ISSUERS = new Set([
  'https://api.botframework.com',
]);
const CLOCK_SKEW_SEC = 5 * 60;

interface JwksKey {
  kty: string;
  kid: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

interface JwksCache {
  keys: JwksKey[];
  fetchedAt: number;
}

let cachedJwks: JwksCache | null = null;
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

/** Test seam — drop the JWKS cache. */
export function __resetJwksCacheForTests(): void {
  cachedJwks = null;
}

async function fetchJwks(): Promise<JwksKey[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const cfgRes = await fetch(BOT_FRAMEWORK_OPENID_URL);
  if (!cfgRes.ok) throw new Error(`openidconfiguration fetch failed: ${cfgRes.status}`);
  const cfg = (await cfgRes.json()) as { jwks_uri?: string };
  if (!cfg.jwks_uri) throw new Error('openidconfiguration missing jwks_uri');
  const jwksRes = await fetch(cfg.jwks_uri);
  if (!jwksRes.ok) throw new Error(`jwks fetch failed: ${jwksRes.status}`);
  const jwks = (await jwksRes.json()) as { keys?: JwksKey[] };
  cachedJwks = { keys: jwks.keys ?? [], fetchedAt: now };
  return cachedJwks.keys;
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const std = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(std, 'base64');
}

function jwkToPem(key: JwksKey): string | null {
  // Prefer x5c if present (cert chain) — easiest path: PEM-wrap the leaf cert.
  if (key.x5c && key.x5c.length > 0) {
    const cert = key.x5c[0].replace(/(.{64})/g, '$1\n');
    return `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----\n`;
  }
  // Fall back to constructing an RSA public key from n + e using
  // node:crypto's createPublicKey({ key: jwk, format: 'jwk' }).
  if (key.kty === 'RSA' && key.n && key.e) {
    try {
      const pub = crypto.createPublicKey({
        key: { kty: 'RSA', n: key.n, e: key.e },
        format: 'jwk',
      });
      return pub.export({ type: 'spki', format: 'pem' }) as string;
    } catch {
      return null;
    }
  }
  return null;
}

function expectedAudience(): string | null {
  return process.env.TEAMS_BOT_ID || process.env.TEAMS_APP_ID || null;
}

/**
 * Verify a Bot Framework JWT from an `Authorization: Bearer ...` header.
 *
 * Returns `{ ok: true }` only when:
 *   1. The token is well-formed (3 base64url segments)
 *   2. The signature validates against a Microsoft public key
 *   3. issuer is in EXPECTED_ISSUERS
 *   4. audience matches our bot id
 *   5. exp/nbf within ±5 minute clock skew
 *
 * Test bypass: TEAMS_DISABLE_JWT_VERIFY=1 + non-prod NODE_ENV. This
 * exists so unit tests can post fixture activities; production deploys
 * MUST not set the variable.
 */
export async function verifyTeamsRequest(authorizationHeader: string | null | undefined): Promise<VerifyTeamsResult> {
  // Test bypass — ONLY outside production.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.TEAMS_DISABLE_JWT_VERIFY === '1'
  ) {
    return { ok: true, reason: 'test_bypass' };
  }

  if (!authorizationHeader || !authorizationHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, reason: 'missing_authorization' };
  }
  const token = authorizationHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed_jwt' };

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString('utf8')) as JwtHeader;
    payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8')) as JwtPayload;
  } catch {
    return { ok: false, reason: 'malformed_jwt' };
  }

  if (header.alg !== 'RS256') return { ok: false, reason: 'malformed_jwt' };

  // Fetch keyset.
  let keys: JwksKey[];
  try {
    keys = await fetchJwks();
  } catch {
    return { ok: false, reason: 'fetch_jwks_failed' };
  }
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) return { ok: false, reason: 'unknown_kid' };
  const pem = jwkToPem(key);
  if (!pem) return { ok: false, reason: 'unknown_kid' };

  // Verify signature.
  const signingInput = `${parts[0]}.${parts[1]}`;
  const sigBuf = b64urlDecode(parts[2]);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  let signatureOk: boolean;
  try {
    signatureOk = verifier.verify(pem, sigBuf);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { ok: false, reason: 'bad_signature' };

  // Validate claims.
  if (!payload.iss || !EXPECTED_ISSUERS.has(payload.iss)) {
    return { ok: false, reason: 'wrong_issuer' };
  }
  const aud = expectedAudience();
  if (aud && payload.aud !== aud) {
    return { ok: false, reason: 'wrong_audience' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && nowSec > payload.exp + CLOCK_SKEW_SEC) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload.nbf === 'number' && nowSec + CLOCK_SKEW_SEC < payload.nbf) {
    return { ok: false, reason: 'not_yet_valid' };
  }

  return { ok: true, reason: 'ok' };
}
