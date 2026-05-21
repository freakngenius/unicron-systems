// GET  /api/atrium/me/preferences  — read notification preferences for a team member
// PATCH /api/atrium/me/preferences — update notification preferences for a team member
//
// Uses ns_get_member_notifications / ns_update_member_notifications RPCs.
// nervous_system schema is NOT exposed in PostgREST (PGRST106).
// All DB access goes through public-schema SECURITY DEFINER RPCs.
//
// Sprint 7 Task 2 (Notifications) hardening:
//  - Strict whitelist validation of the `notifications` payload (rejects extras).
//  - `calendar_minutes_before` clamped to [5, 60].
//  - Taboo Keeper refusal-layer check before the write (fails closed).
//  - Writes are audit-logged via ns_audit_log_append
//    (action='notification_prefs_update').
//  - Response returns the merged preferences object so the UI stays in sync.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Notification payload shape + defaults ──────────────────────────────────
// Mirrors the spec in Sprint 7 Task 2 (lines 104-128 of the sprint prompt).

interface AtriumBadges {
  escalations: boolean;
  calendar: boolean;
  calls: boolean;
  sprints: boolean;
  calendar_minutes_before: number;
}

interface NotificationPreferences {
  slack_dm: boolean;
  slack_escalations_channel: boolean;
  atrium_badges: AtriumBadges;
  email_digest: boolean;
  push_notifications: boolean;
}

const TOP_KEYS = [
  'slack_dm',
  'slack_escalations_channel',
  'atrium_badges',
  'email_digest',
  'push_notifications',
] as const;

const BADGE_KEYS = [
  'escalations',
  'calendar',
  'calls',
  'sprints',
  'calendar_minutes_before',
] as const;

const MIN_MINUTES = 5;
const MAX_MINUTES = 60;

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 15;
  const i = Math.round(n);
  if (i < MIN_MINUTES) return MIN_MINUTES;
  if (i > MAX_MINUTES) return MAX_MINUTES;
  return i;
}

interface ValidationOk { ok: true; value: NotificationPreferences; error?: undefined; }
interface ValidationErr { ok: false; error: string; value?: undefined; }
type ValidationResult = ValidationOk | ValidationErr;

function fail(error: string): ValidationErr { return { ok: false, error }; }

function validateNotifications(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('notifications must be an object');
  }
  const obj = raw as Record<string, unknown>;

  // Reject any unknown top-level keys.
  for (const k of Object.keys(obj)) {
    if (!(TOP_KEYS as readonly string[]).includes(k)) {
      return fail(`unknown notification key: ${k}`);
    }
  }

  const slack_dm = obj['slack_dm'];
  const slack_escalations_channel = obj['slack_escalations_channel'];
  const email_digest = obj['email_digest'];
  const push_notifications = obj['push_notifications'];
  const badgesRaw = obj['atrium_badges'];

  for (const [name, v] of [
    ['slack_dm', slack_dm],
    ['slack_escalations_channel', slack_escalations_channel],
    ['email_digest', email_digest],
    ['push_notifications', push_notifications],
  ] as const) {
    if (typeof v !== 'boolean') {
      return fail(`${name} must be a boolean`);
    }
  }

  if (!badgesRaw || typeof badgesRaw !== 'object' || Array.isArray(badgesRaw)) {
    return fail('atrium_badges must be an object');
  }
  const badges = badgesRaw as Record<string, unknown>;
  for (const k of Object.keys(badges)) {
    if (!(BADGE_KEYS as readonly string[]).includes(k)) {
      return fail(`unknown atrium_badges key: ${k}`);
    }
  }
  for (const name of ['escalations', 'calendar', 'calls', 'sprints'] as const) {
    if (typeof badges[name] !== 'boolean') {
      return fail(`atrium_badges.${name} must be a boolean`);
    }
  }
  const minutesRaw = badges['calendar_minutes_before'];
  if (typeof minutesRaw !== 'number') {
    return fail('atrium_badges.calendar_minutes_before must be a number');
  }

  const value: NotificationPreferences = {
    slack_dm: slack_dm as boolean,
    slack_escalations_channel: slack_escalations_channel as boolean,
    email_digest: email_digest as boolean,
    push_notifications: push_notifications as boolean,
    atrium_badges: {
      escalations: badges['escalations'] as boolean,
      calendar: badges['calendar'] as boolean,
      calls: badges['calls'] as boolean,
      sprints: badges['sprints'] as boolean,
      calendar_minutes_before: clampMinutes(minutesRaw),
    },
  };
  return { ok: true, value };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── GET: read current preferences ──────────────────────────────────────────
  if (req.method === 'GET') {
    const member_id = req.query['member_id'] as string | undefined;
    if (!member_id) {
      res.status(400).json({ error: 'member_id query param required' });
      return;
    }
    if (!UUID_RE.test(member_id)) {
      res.status(400).json({ error: 'member_id must be a valid UUID' });
      return;
    }

    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_get_member_notifications', {
        p_member_id: member_id,
      });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ notifications: data ?? {} });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ── PATCH: update preferences ───────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as Record<string, unknown> | undefined;
    const member_id = body?.['member_id'];
    const notificationsRaw = body?.['notifications'];

    if (!member_id || typeof member_id !== 'string') {
      res.status(400).json({ error: 'member_id required' });
      return;
    }
    if (!UUID_RE.test(member_id)) {
      res.status(400).json({ error: 'member_id must be a valid UUID' });
      return;
    }

    const validation = validateNotifications(notificationsRaw);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const notifications = validation.value;

    try {
      const sb = getServiceClient();

      // HARD CONSTRAINT 2 — refusal layer is primary.
      // Run the proposed mutation through Taboo Keeper before writing.
      // RPC errors fail closed; no silent bypass.
      const tabooCheck = await sb.rpc('ns_check_taboo', {
        p_action: 'team_member.notification_prefs.update',
        p_target: member_id,
        p_actor: member_id,
        p_context: JSON.stringify(notifications),
      });

      if (tabooCheck.error) {
        res.status(500).json({
          error: `Taboo Keeper unreachable; refusing to proceed: ${tabooCheck.error.message}`,
        });
        return;
      }

      const tabooResult = (tabooCheck.data ?? {}) as {
        blocked?: boolean;
        reason?: string;
        matched_rule?: string;
      };

      if (tabooResult.blocked === true) {
        res.status(422).json({
          blocked: true,
          reason: tabooResult.reason ?? 'Taboo Keeper blocked this action',
          matched_rule: tabooResult.matched_rule ?? null,
        });
        return;
      }

      // Persist the merged jsonb. The RPC keeps other config keys intact.
      const { error: updErr } = await sb.rpc('ns_update_member_notifications', {
        p_member_id: member_id,
        p_notifications: notifications,
      });
      if (updErr) {
        if (updErr.message.includes('not found')) {
          res.status(404).json({ error: updErr.message });
          return;
        }
        res.status(500).json({ error: updErr.message });
        return;
      }

      // Audit-log the change. Best-effort: a missing/older RPC must not fail
      // the user-visible save. Sprint 7 Task 2 requirement.
      let audit_log_id: string | null = null;
      try {
        const auditResp = await sb.rpc('ns_audit_log_append', {
          p_table_name: 'team_members',
          p_action: 'notification_prefs_update',
          p_payload: {
            member_id,
            notifications,
            taboo_result: tabooResult,
          },
        });
        if (!auditResp.error && typeof auditResp.data === 'string') {
          audit_log_id = auditResp.data;
        }
      } catch {
        // Swallow — write already succeeded; audit is advisory.
      }

      // Return the merged preferences so the UI can confirm round-trip.
      res.status(200).json({
        ok: true,
        notifications,
        audit_log_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
