// POST /api/slack/commands
// Handles the /orchestrator slash command and its subcommands:
//   status       — active sprint card summary (stub; wired in Sprint 3)
//   escalations  — open escalations from Taboo Keeper (stub; wired in Sprint 3)
//   memory       — semantic vault search (stub; wired in Sprint 3)
//   dri          — reassign an action-item DRI (stub; wired in Sprint 3)

import { createHmac } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------------------------------------------------------------------------
// Signature verification (identical logic to events.ts)
// ---------------------------------------------------------------------------

function verifySlackSignature(req: VercelRequest, rawBody: string): boolean {
  const timestamp = Array.isArray(req.headers['x-slack-request-timestamp'])
    ? req.headers['x-slack-request-timestamp'][0]
    : req.headers['x-slack-request-timestamp'];
  const slackSig = Array.isArray(req.headers['x-slack-signature'])
    ? req.headers['x-slack-signature'][0]
    : req.headers['x-slack-signature'];

  if (!timestamp || !slackSig) return false;

  const fiveMinutes = 5 * 60;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > fiveMinutes) return false;

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET is not set');
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac('sha256', signingSecret);
  const computed = `v0=${hmac.update(sigBase).digest('hex')}`;

  if (computed.length !== slackSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ slackSig.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Ephemeral response — only visible to the user who ran the command. */
function ephemeral(text: string): object {
  return { response_type: 'ephemeral', text };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  // Slash-command payloads arrive as application/x-www-form-urlencoded.
  // Vercel parses this into req.body as a plain object when the content-type
  // header matches; fall back to manual parsing if it arrives as a string.
  const rawBody =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : new URLSearchParams(req.body as Record<string, string>).toString();

  if (!verifySlackSignature(req, rawBody)) {
    res.status(401).json({ ok: false, error: 'signature verification failed' });
    return;
  }

  // Parse the form fields (req.body may already be an object from Vercel middleware)
  let params: URLSearchParams;
  if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
    params = new URLSearchParams(req.body as Record<string, string>);
  } else {
    params = new URLSearchParams(rawBody);
  }

  const text = params.get('text') ?? '';

  const parts = text.trim().split(/\s+/);
  const subcommand = parts[0] ?? '';
  const args = parts.slice(1);

  switch (subcommand) {
    case 'status':
      res.status(200).json(
        ephemeral('_/orchestrator status_: Fetching active sprints… (full query live in Sprint 3)'),
      );
      return;

    case 'escalations':
      res.status(200).json(
        ephemeral('_/orchestrator escalations_: Fetching open escalations… (live in Sprint 3)'),
      );
      return;

    case 'memory': {
      const query = args.join(' ');
      if (!query) {
        res.status(200).json(ephemeral('Usage: /orchestrator memory <query>'));
        return;
      }
      res.status(200).json(
        ephemeral(`_/orchestrator memory "${query}"_: Searching vault… (semantic search live in Sprint 3)`),
      );
      return;
    }

    case 'dri': {
      const [actionItemId, teamMember] = args;
      if (!actionItemId || !teamMember) {
        res.status(200).json(
          ephemeral('Usage: /orchestrator dri <action_item_id> <team_member_name>'),
        );
        return;
      }
      res.status(200).json(
        ephemeral(
          `_/orchestrator dri_: Reassigning ${actionItemId} to ${teamMember}… (live in Sprint 3)`,
        ),
      );
      return;
    }

    default:
      res.status(200).json(
        ephemeral(
          'Unknown subcommand. Try: `status` | `escalations` | `memory <query>` | `dri <id> <member>`',
        ),
      );
  }
}
