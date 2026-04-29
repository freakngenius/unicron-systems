// __tests__/hubspot/webhook-signature.test.ts — round-trip the v3
// signature algorithm. Positive case: a freshly-signed request
// validates. Negative cases: wrong secret, stale timestamp, mutated
// body — all must reject.
//
// The v3 algorithm (per HubSpot's developer changelog) is:
//   HMAC-SHA256(method + uri + body + timestamp, app_secret) → base64
// Headers used:
//   X-HubSpot-Signature-v3
//   X-HubSpot-Request-Timestamp

import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { signV3, verifyV3Signature } from '@/lib/hubspot/webhook-signature';

const APP_SECRET = 'secret-test-value';
const METHOD = 'POST';
const URI = 'https://app.example.test/api/webhooks/hubspot';
const BODY = '[{"eventId":1,"objectId":42,"propertyName":"dealstage","propertyValue":"presentationscheduled","occurredAt":1714694400000}]';

describe('signV3', () => {
  it('produces the same value as a manual HMAC of the canonical string', () => {
    const ts = '1714694400000';
    const expected = crypto
      .createHmac('sha256', APP_SECRET)
      .update(METHOD + URI + BODY + ts, 'utf8')
      .digest('base64');
    const got = signV3({ method: METHOD, uri: URI, body: BODY, timestamp: ts, secret: APP_SECRET });
    expect(got).toBe(expected);
  });
});

describe('verifyV3Signature', () => {
  it('accepts a valid, freshly-signed request', () => {
    const ts = String(Date.now());
    const sig = signV3({ method: METHOD, uri: URI, body: BODY, timestamp: ts, secret: APP_SECRET });

    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: ts,
      signature: sig,
      secret: APP_SECRET,
    });

    expect(result.ok).toBe(true);
  });

  it('rejects when the wrong secret is used', () => {
    const ts = String(Date.now());
    const sig = signV3({ method: METHOD, uri: URI, body: BODY, timestamp: ts, secret: APP_SECRET });
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: ts,
      signature: sig,
      secret: 'different-secret',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects when the body is mutated', () => {
    const ts = String(Date.now());
    const sig = signV3({ method: METHOD, uri: URI, body: BODY, timestamp: ts, secret: APP_SECRET });
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY.replace('42', '99'),
      timestamp: ts,
      signature: sig,
      secret: APP_SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects timestamps older than the 5-minute skew window', () => {
    const ts = String(Date.now() - 6 * 60 * 1000); // 6 min ago
    const sig = signV3({ method: METHOD, uri: URI, body: BODY, timestamp: ts, secret: APP_SECRET });
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: ts,
      signature: sig,
      secret: APP_SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('stale_timestamp');
  });

  it('rejects when the timestamp header is missing or non-numeric', () => {
    const sig = 'irrelevant';
    const noTs = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: '',
      signature: sig,
      secret: APP_SECRET,
    });
    expect(noTs.ok).toBe(false);
    expect(noTs.reason).toBe('missing_timestamp');

    const badTs = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: 'abc',
      signature: sig,
      secret: APP_SECRET,
    });
    expect(badTs.ok).toBe(false);
    expect(badTs.reason).toBe('missing_timestamp');
  });

  it('rejects when the signature header is missing', () => {
    const ts = String(Date.now());
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: ts,
      signature: '',
      secret: APP_SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_signature');
  });
});
