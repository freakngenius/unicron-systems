// lib/connectors/state.ts — signed OAuth state token.
//
// Pattern: `${nonce}.${signature}` where nonce is a URL-safe base64 of a
// JSON payload {org_id, type, exp_ms, csrf} and signature is HMAC-SHA256
// of the raw nonce string keyed by CONNECTOR_STATE_SECRET (or, as a v1
// fallback, CRON_SECRET — same convention as lib/slack/install.ts).
//
// Verification:
//   • signature must match
//   • exp_ms must be in the future (5-minute window)
//   • type must equal the callback's expected provider type
//
// SPEC § 5.3 — anti-CSRF nonce + signed org_id + connector type.

import crypto from 'node:crypto';

import type { ConnectorType } from '@/lib/connectors/types';

const STATE_TTL_MS = 5 * 60 * 1000;

interface StatePayload {
  org_id: string;
  type: ConnectorType;
  exp_ms: number;
  csrf: string;
}

function stateSecret(): string {
  const s = process.env.CONNECTOR_STATE_SECRET ?? process.env.CRON_SECRET;
  if (!s) {
    throw new Error(
      'CONNECTOR_STATE_SECRET (or fallback CRON_SECRET) not set; cannot sign OAuth state',
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(nonce: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(nonce, 'utf8').digest('hex');
}

export function buildState(args: { orgId: string; type: ConnectorType }): string {
  const payload: StatePayload = {
    org_id: args.orgId,
    type: args.type,
    exp_ms: Date.now() + STATE_TTL_MS,
    csrf: crypto.randomBytes(16).toString('hex'),
  };
  const nonce = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = sign(nonce, stateSecret());
  return `${nonce}.${sig}`;
}

export type StateVerifyReason =
  | 'ok'
  | 'malformed'
  | 'signature_mismatch'
  | 'expired'
  | 'type_mismatch';

export interface StateVerifyResult {
  ok: boolean;
  reason: StateVerifyReason;
  orgId?: string;
  type?: ConnectorType;
}

export function verifyState(
  state: string | null | undefined,
  expectedType: ConnectorType,
): StateVerifyResult {
  if (!state || typeof state !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  const dot = state.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };

  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = sign(nonce, stateSecret());
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(b64urlDecode(nonce).toString('utf8')) as StatePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload.exp_ms !== 'number' || payload.exp_ms < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.type !== expectedType) {
    return { ok: false, reason: 'type_mismatch' };
  }
  if (typeof payload.org_id !== 'string' || payload.org_id.length === 0) {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, reason: 'ok', orgId: payload.org_id, type: payload.type };
}
