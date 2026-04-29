// lib/hubspot/webhook-signature.ts — HubSpot v3 webhook signature
// helpers. Algorithm:
//
//   sig = base64( HMAC-SHA256( method + uri + body + timestamp, app_secret ) )
//
// Requests are rejected if the timestamp drift exceeds 5 minutes, even
// when the signature itself is valid (HubSpot's published guidance).
// Constant-time compare guards against timing attacks.
//
// Spec source: HubSpot "Introducing version 3 of Webhook signatures",
// https://developers.hubspot.com/changelog/introducing-version-3-of-webhook-signatures
// and https://developers.hubspot.com/docs/api/webhooks/validating-requests.

import crypto from 'node:crypto';

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

export interface SignV3Input {
  method: string;
  uri: string;
  body: string;
  timestamp: string; // ms-epoch as string (HubSpot's header value)
  secret: string;
}

export function signV3(input: SignV3Input): string {
  return crypto
    .createHmac('sha256', input.secret)
    .update(input.method + input.uri + input.body + input.timestamp, 'utf8')
    .digest('base64');
}

export type VerifyReason =
  | 'ok'
  | 'missing_signature'
  | 'missing_timestamp'
  | 'stale_timestamp'
  | 'signature_mismatch';

export interface VerifyV3Input extends SignV3Input {
  signature: string;
}

export interface VerifyV3Result {
  ok: boolean;
  reason: VerifyReason;
}

export function verifyV3Signature(input: VerifyV3Input): VerifyV3Result {
  if (!input.signature) return { ok: false, reason: 'missing_signature' };

  const tsNum = Number(input.timestamp);
  if (!input.timestamp || !Number.isFinite(tsNum)) {
    return { ok: false, reason: 'missing_timestamp' };
  }
  if (Math.abs(Date.now() - tsNum) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = signV3(input);

  // Both buffers must be the same length for timingSafeEqual.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signature, 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'signature_mismatch' };

  const matches = crypto.timingSafeEqual(a, b);
  return matches
    ? { ok: true, reason: 'ok' }
    : { ok: false, reason: 'signature_mismatch' };
}
