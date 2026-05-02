// lib/probes.ts — server-side health probes for the Settings UI's
// Connection-status card. Each probe returns a `ProbeResult` shape with
// status + detail; the route handlers in `app/api/probes/*` thin-wrap
// these and add the 5-minute cache.

export interface ProbeResult {
  status: 'ok' | 'degraded' | 'failed' | 'unknown';
  detail: string;
  /** ISO timestamp of the probe; used for "last checked Xm ago" UI hints. */
  checked_at: string;
}

function ok(detail: string): ProbeResult {
  return { status: 'ok', detail, checked_at: new Date().toISOString() };
}

function failed(detail: string): ProbeResult {
  return { status: 'failed', detail, checked_at: new Date().toISOString() };
}

function unknown(detail: string): ProbeResult {
  return { status: 'unknown', detail, checked_at: new Date().toISOString() };
}

// ────────────────────────────────────────────────────────────────────────
// Slack webhook probe.
//
// We can't HEAD an `incoming-webhook/services/.../...` URL safely — Slack
// returns 200 for any URL that *parses* like a webhook, even revoked ones.
// The reliable signal is to POST an empty `{}` body. Slack's response
// taxonomy:
//   • valid webhook + missing payload → 400 with body "no_text" or
//     "invalid_payload" → proves the webhook is real.
//   • revoked / unknown channel       → 404 "no_service" / "channel_not_found"
//   • bad host                        → DNS / fetch failure.
//
// We treat 4xx with a known Slack error body as "ok" (URL is registered),
// 4xx with "no_service" / 404 as "failed" (revoked), and anything else as
// "failed".
// ────────────────────────────────────────────────────────────────────────

const SLACK_VALID_BODIES = new Set([
  'no_text',
  'invalid_payload',
  'missing_text_or_fallback_or_attachments',
]);

const SLACK_REVOKED_BODIES = new Set([
  'no_service',
  'invalid_token',
  'channel_not_found',
]);

export async function probeSlackWebhook(
  webhookUrl: string | undefined = process.env.SLACK_WEBHOOK_URL,
): Promise<ProbeResult> {
  if (!webhookUrl) {
    return unknown('SLACK_WEBHOOK_URL not configured');
  }
  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    return failed('SLACK_WEBHOOK_URL is not a valid URL');
  }
  if (parsed.host !== 'hooks.slack.com') {
    return failed(`SLACK_WEBHOOK_URL host is ${parsed.host}; expected hooks.slack.com`);
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await res.text()).trim().toLowerCase();
    if (SLACK_VALID_BODIES.has(body)) {
      return ok(`webhook registered (Slack: "${body}")`);
    }
    if (SLACK_REVOKED_BODIES.has(body) || res.status === 404) {
      return failed(`webhook revoked or invalid (Slack: "${body || res.status}")`);
    }
    if (res.ok) {
      // Unexpectedly accepted an empty body; treat as ok.
      return ok('webhook accepted empty payload');
    }
    return failed(`unexpected response status=${res.status} body="${body.slice(0, 80)}"`);
  } catch (err) {
    return failed(`network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Resend API probe.
//
// `GET https://api.resend.com/domains` returns 200 with a JSON list when
// the API key is valid, 401/403 with an `{"name":"invalid_api_Key", ...}`
// envelope when invalid. Any other failure is treated as "failed".
// ────────────────────────────────────────────────────────────────────────

interface ResendDomainsResponse {
  data?: Array<{ id: string; name: string; status?: string }>;
  // Error envelope variants.
  message?: string;
  name?: string;
  statusCode?: number;
}

export async function probeResend(
  apiKey: string | undefined = process.env.RESEND_API_KEY,
): Promise<ProbeResult> {
  if (!apiKey) {
    return unknown('RESEND_API_KEY not configured');
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      return failed(`Resend rejected the API key (HTTP ${res.status})`);
    }
    if (!res.ok) {
      return failed(`Resend returned HTTP ${res.status}`);
    }
    const json = (await res.json()) as ResendDomainsResponse;
    const count = Array.isArray(json.data) ? json.data.length : 0;
    if (count === 0) {
      return {
        status: 'degraded',
        detail: 'API key valid but no verified domains; emails will fail send',
        checked_at: new Date().toISOString(),
      };
    }
    return ok(`${count} domain${count === 1 ? '' : 's'} verified`);
  } catch (err) {
    return failed(`network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const __test__ = { SLACK_VALID_BODIES, SLACK_REVOKED_BODIES };
