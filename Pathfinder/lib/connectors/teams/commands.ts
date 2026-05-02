// lib/connectors/teams/commands.ts — pure parser for @-mention text.
//
// Teams delivers @-mentions as Bot Framework Activity payloads. The
// `text` field comes through with the bot's mention token wrapped in
// `<at>Pathfinder</at>` (or just embedded in the text on mobile).
// We strip those before parsing so the verb logic mirrors Slack's
// commands.ts byte-for-byte.
//
// Supported subcommands (case-insensitive on the verb):
//   leads [N]                              → list top N leads
//   rejected                               → recent rejected pile sample
//   feedback <project_id> <up|down> [reason] → record feedback
//   help                                   → list commands
//
// The Slack parser is the canonical reference; any divergence here is a
// bug. Keep them in sync.

export type ParsedCommand =
  | { kind: 'leads'; limit: number }
  | { kind: 'rejected' }
  | { kind: 'feedback'; projectId: string; thumb: 'up' | 'down'; reason: string | null }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string };

const DEFAULT_LEADS_LIMIT = 5;
const MAX_LEADS_LIMIT = 25;

/**
 * Strip `<at>Bot</at>` mention tokens and any leading bot-name word.
 *
 * The Teams Activity payload normally includes an `entities[]` array with
 * `{type: 'mention', mentioned: {id, name}}` items; the route extracts
 * the bot's name and passes it here so we can strip it from arbitrary
 * positions (mobile clients sometimes flatten the tag).
 */
export function stripMention(text: string, botName: string | null): string {
  if (!text) return '';
  // Strip Adaptive HTML-style `<at>...</at>` tokens regardless of inner name.
  let out = text.replace(/<at[^>]*>[^<]*<\/at>/gi, '');
  if (botName) {
    // Strip a leading literal `@BotName` if mobile flattened the tag.
    const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`@?${escaped}\\b`, 'gi'), '');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function parseCommand(text: string | null | undefined, botName: string | null = null): ParsedCommand {
  const stripped = stripMention((text ?? '').trim(), botName);
  if (stripped.length === 0) return { kind: 'help' };

  const parts = stripped.split(/\s+/);
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
    if (!projectId || !thumb) return { kind: 'unknown', raw: stripped };
    const reasonParts = parts.slice(3);
    const reason = reasonParts.length > 0 ? reasonParts.join(' ').slice(0, 500) : null;
    return { kind: 'feedback', projectId, thumb, reason };
  }

  return { kind: 'unknown', raw: stripped };
}
