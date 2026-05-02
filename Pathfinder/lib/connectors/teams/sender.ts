// lib/connectors/teams/sender.ts — Bot Framework outbound message sender.
//
// Two send paths exist:
//   1. **Reply** to an Activity (proactive message in the same
//      conversation): POST to `{serviceUrl}/v3/conversations/{conversationId}/activities`
//      with the bot app token from acquireBotAppToken().
//   2. **Outbound dispatcher** posting to a routing-rule channel id: same
//      endpoint shape, but the conversation reference must have been
//      stashed when the bot was first installed (we record it from the
//      `conversationUpdate` event).
//
// SPEC § 4.2 outbound features map to dispatchEvent → sendToConnector.
// The dispatcher loads the connector row, looks up `metadata.serviceUrl`
// and `metadata.conversations` for the channel id, then calls postActivity.
//
// All outbound calls are best-effort fail-open per SPEC § 3.5; the
// dispatcher records the failure to connector_audit_log without
// propagating to the agent caller.

import { acquireBotAppToken } from './oauth';
import { toAttachment, type AdaptiveCard } from './adaptive-cards';

export interface PostActivityArgs {
  serviceUrl: string;
  conversationId: string;
  /** Either a plain string OR an Adaptive Card to wrap. */
  text?: string;
  card?: AdaptiveCard;
  /** Optional reply-to id (replies-in-thread for channel posts). */
  replyToId?: string;
}

export interface PostActivityResult {
  ok: boolean;
  status: number;
  /** The Bot Framework returns the new activity id on success. */
  activityId: string | null;
  errorMessage: string | null;
}

/**
 * Post an Activity to a Teams conversation via the Bot Connector REST
 * API. Returns the activity id for audit / cross-reference.
 *
 * The serviceUrl is the *conversation's* Bot Framework endpoint
 * (typically `https://smba.trafficmanager.net/<region>/`). NEVER hard-code
 * the serviceUrl — Microsoft's docs explicitly require trusting the
 * incoming Activity's serviceUrl per-conversation.
 */
export async function postActivity(args: PostActivityArgs): Promise<PostActivityResult> {
  const trimmedServiceUrl = args.serviceUrl.replace(/\/+$/, '');
  const url = `${trimmedServiceUrl}/v3/conversations/${encodeURIComponent(args.conversationId)}/activities`;

  let appToken: string;
  try {
    const tok = await acquireBotAppToken();
    appToken = tok.access_token;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      activityId: null,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const body: Record<string, unknown> = {
    type: 'message',
  };
  if (args.replyToId) body.replyToId = args.replyToId;
  if (args.card) {
    body.attachments = [toAttachment(args.card)];
    body.attachmentLayout = 'list';
  } else if (args.text) {
    body.text = args.text;
  } else {
    return {
      ok: false,
      status: 0,
      activityId: null,
      errorMessage: 'postActivity requires either text or card',
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${appToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      activityId: null,
      errorMessage: `bot framework post failed: ${res.status} ${detail.slice(0, 200)}`,
    };
  }

  let activityId: string | null = null;
  try {
    const json = (await res.json()) as { id?: string };
    activityId = json.id ?? null;
  } catch {
    /* responses can be empty on success */
  }
  return { ok: true, status: res.status, activityId, errorMessage: null };
}

// ────────────────────────────────────────────────────────────────────────
// Test seam — the dispatcher import resolves through this re-exported
// function so unit tests can override transport without monkey-patching
// fetch globally.
// ────────────────────────────────────────────────────────────────────────

let _override: ((args: PostActivityArgs) => Promise<PostActivityResult>) | null = null;

export function __setSenderOverrideForTests(
  fn: ((args: PostActivityArgs) => Promise<PostActivityResult>) | null,
): void {
  _override = fn;
}

export async function postActivityWithOverride(args: PostActivityArgs): Promise<PostActivityResult> {
  if (_override) return _override(args);
  return postActivity(args);
}
