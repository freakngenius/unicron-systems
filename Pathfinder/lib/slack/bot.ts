// lib/slack/bot.ts — Slack web-api client factory + signature helper +
// workspace lookup. The single network entry point for the Pathfinder
// Slack bot.
//
// Public interface:
//
//   getClient(teamId)           → WebClient bound to the workspace's bot token
//   getWorkspace(teamId)        → SlackWorkspace row (null if uninstalled)
//   verifySlackSignature(input) → HMAC-SHA256 verification per Slack's v0 scheme
//
// All Supabase reads use the service-role client because slack_workspaces
// and slack_branch_routes are RLS-locked to service_role (RLS allows no
// anon read because bot_token is sensitive).

import crypto from 'node:crypto';
import { WebClient } from '@slack/web-api';

import { supabaseAdmin } from '@/lib/supabase';
import type { SlackWorkspace } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Workspace lookup (cached for the request lifetime)
// ────────────────────────────────────────────────────────────────────────

let _admin: ReturnType<typeof supabaseAdmin> | null = null;
function admin() {
  if (!_admin) _admin = supabaseAdmin();
  return _admin;
}

const _workspaceCache = new Map<string, SlackWorkspace>();
const _clientCache = new Map<string, WebClient>();

export async function getWorkspace(teamId: string): Promise<SlackWorkspace | null> {
  const cached = _workspaceCache.get(teamId);
  if (cached) return cached;

  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const r = await sb.from('slack_workspaces').select('*').eq('team_id', teamId).maybeSingle();
  if (r.error || !r.data) return null;
  const row = r.data as unknown as SlackWorkspace;
  if (row.uninstalled_at) return null;
  _workspaceCache.set(teamId, row);
  return row;
}

export async function getClient(teamId: string): Promise<WebClient> {
  const cached = _clientCache.get(teamId);
  if (cached) return cached;

  const ws = await getWorkspace(teamId);
  if (!ws) {
    throw new Error(`Slack workspace not installed or already uninstalled: ${teamId}`);
  }
  const client = new WebClient(ws.bot_token);
  _clientCache.set(teamId, client);
  return client;
}

/** Test seam: clear the in-memory caches between cases. */
export function resetSlackCachesForTesting(): void {
  _workspaceCache.clear();
  _clientCache.clear();
}

// ────────────────────────────────────────────────────────────────────────
// Slack v0 signature verification
//
// Algorithm (per https://api.slack.com/authentication/verifying-requests-from-slack):
//
//   sig = 'v0=' + hex( HMAC-SHA256( 'v0:' + timestamp + ':' + body, signing_secret ) )
//
// Reject if the timestamp is older than 5 minutes (replay protection).
// Constant-time compare guards against timing attacks.
// ────────────────────────────────────────────────────────────────────────

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

export type SlackVerifyReason =
  | 'ok'
  | 'missing_signature'
  | 'missing_timestamp'
  | 'stale_timestamp'
  | 'signature_mismatch';

export interface VerifySlackSignatureInput {
  /** Raw `X-Slack-Signature` header. */
  signature: string | null | undefined;
  /** Raw `X-Slack-Request-Timestamp` header (seconds-since-epoch). */
  timestamp: string | null | undefined;
  /** The raw request body — must be the exact bytes Slack signed. */
  body: string;
  /** Slack signing secret from app credentials. */
  secret: string;
}

export interface VerifySlackSignatureResult {
  ok: boolean;
  reason: SlackVerifyReason;
}

export function signSlackV0(timestamp: string, body: string, secret: string): string {
  const base = `v0:${timestamp}:${body}`;
  const mac = crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex');
  return `v0=${mac}`;
}

export function verifySlackSignature(input: VerifySlackSignatureInput): VerifySlackSignatureResult {
  if (!input.signature) return { ok: false, reason: 'missing_signature' };
  if (!input.timestamp) return { ok: false, reason: 'missing_timestamp' };

  const tsSec = Number(input.timestamp);
  if (!Number.isFinite(tsSec)) return { ok: false, reason: 'missing_timestamp' };

  if (Math.abs(Date.now() - tsSec * 1000) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = signSlackV0(input.timestamp, input.body, input.secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signature, 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'signature_mismatch' };
  return crypto.timingSafeEqual(a, b)
    ? { ok: true, reason: 'ok' }
    : { ok: false, reason: 'signature_mismatch' };
}

// ────────────────────────────────────────────────────────────────────────
// Audit-log helper — agent_name='slack-bot' per spec hard rule
// ────────────────────────────────────────────────────────────────────────

type AuditPayload = Record<string, unknown> & { message?: string };

export async function auditSlack(eventType: string, data: AuditPayload): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  try {
    await sb.from('agent_log').insert({
      agent_name: 'slack-bot',
      event_type: eventType,
      event_data: data,
    });
  } catch {
    // Audit best-effort; do not fail the caller because logging failed.
  }
}
