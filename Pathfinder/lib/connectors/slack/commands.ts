// lib/connectors/slack/commands.ts — pure parser for /pathfinder text.
//
// Slack delivers slash-command payloads as form-encoded POST bodies; the
// route handler verifies the signature, parses the form, and passes the
// `text` field here. We keep parsing pure so it's snapshot-testable and
// the route can stay narrow.
//
// Supported subcommands (case-insensitive on the verb):
//   leads [N]                              → list top N leads
//   rejected                               → recent rejected pile sample
//   feedback <project_id> <up|down> [reason] → record feedback
//   help                                   → list commands
//
// `up` / `down` map to the Architect-loop's thumbs values. Anything else
// returns kind='unknown' and the route emits the help block.

export type ParsedCommand =
  | { kind: 'leads'; limit: number }
  | { kind: 'rejected' }
  | { kind: 'feedback'; projectId: string; thumb: 'up' | 'down'; reason: string | null }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string };

const DEFAULT_LEADS_LIMIT = 5;
const MAX_LEADS_LIMIT = 25;

export function parseCommand(text: string | null | undefined): ParsedCommand {
  const raw = (text ?? '').trim();
  if (raw.length === 0) return { kind: 'help' };

  // Strip a leading `/pathfinder` if Slack sent it as part of `text`
  // (some workspace configs do, most don't).
  const withoutPrefix = raw.replace(/^\/?pathfinder\s+/i, '').trim();
  if (withoutPrefix.length === 0) return { kind: 'help' };

  const parts = withoutPrefix.split(/\s+/);
  const verb = (parts[0] ?? '').toLowerCase();

  if (verb === 'help' || verb === '?') return { kind: 'help' };

  if (verb === 'leads') {
    const n = parts[1] ? parseInt(parts[1], 10) : DEFAULT_LEADS_LIMIT;
    const limit =
      Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_LEADS_LIMIT) : DEFAULT_LEADS_LIMIT;
    return { kind: 'leads', limit };
  }

  if (verb === 'rejected') return { kind: 'rejected' };

  if (verb === 'feedback') {
    const projectId = parts[1] ?? '';
    const thumbRaw = (parts[2] ?? '').toLowerCase();
    const thumb: 'up' | 'down' | null =
      thumbRaw === 'up' || thumbRaw === '+1' || thumbRaw === 'thumbsup'
        ? 'up'
        : thumbRaw === 'down' || thumbRaw === '-1' || thumbRaw === 'thumbsdown'
          ? 'down'
          : null;
    if (!projectId || !thumb) return { kind: 'unknown', raw };
    const reasonParts = parts.slice(3);
    const reason = reasonParts.length > 0 ? reasonParts.join(' ').slice(0, 500) : null;
    return { kind: 'feedback', projectId, thumb, reason };
  }

  return { kind: 'unknown', raw };
}
