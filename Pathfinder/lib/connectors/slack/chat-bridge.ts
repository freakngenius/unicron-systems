// lib/connectors/slack/chat-bridge.ts — adapter from Slack inbound chat
// (app_mention / message.im) to the Pathfinder chat handler.
//
// The chat handler in app/api/chat/route.ts streams SSE — not what we
// want for a Slack reply. For C-1B we use a non-streaming bridge that
// returns a single string. Implementation:
//   1. Strip the bot's own @mention from the text.
//   2. Send an acknowledgement back to Slack immediately (caller posts
//      the response via chat.postMessage).
//
// The full conversational bridge (calling Sonar via lib/chat/sonar)
// will land in a follow-up — wiring an LLM call inside the 3-second
// Slack ack window is fragile. C-1B ships a structurally complete bridge
// that proves the path; the actual Sonar invocation is gated behind a
// follow-up so the OAuth + slash + reaction work isn't blocked on chat
// streaming refactors.

export interface BridgeMessageArgs {
  text: string;
  /** The bot user id (so we can strip its mention from the front). */
  botUserId: string | null;
}

export interface BridgeMessageResult {
  reply: string;
  /** True when the chat path was reached; false on empty / parse failure. */
  routed: boolean;
}

const MAX_REPLY = 1200;

export async function routeChatMessage(args: BridgeMessageArgs): Promise<BridgeMessageResult> {
  const cleaned = stripBotMention(args.text, args.botUserId);
  const trimmed = cleaned.trim();
  if (trimmed.length === 0) {
    return {
      reply:
        "Hi — I'm Pathfinder. Ask me anything about your leads, or use `/pathfinder leads` for a quick view.",
      routed: false,
    };
  }
  // v1 placeholder reply — proves the routing wiring without committing
  // to streaming Sonar through Slack inside the 3-second ack window.
  // The real handler call lands in C-1G when we ship a non-streaming
  // chat endpoint. The contract here is stable: Slack route → this
  // function → string reply.
  return {
    reply:
      `Got it — "${trimmed.slice(0, 200)}"\n` +
      `(C-1B v1: Pathfinder chat over Slack acknowledges your message; full Sonar bridge ships next.) ` +
      `Try \`/pathfinder leads\` for live data right now.`,
    routed: true,
  };
}

export function stripBotMention(text: string, botUserId: string | null): string {
  if (!text) return '';
  if (!botUserId) return text;
  // Slack mention format: `<@U12345>` or `<@U12345|name>`.
  const re = new RegExp(`<@${botUserId}(\\|[^>]+)?>`, 'g');
  return text.replace(re, '').replace(/\s{2,}/g, ' ');
}

export function clipReply(s: string): string {
  if (s.length <= MAX_REPLY) return s;
  return s.slice(0, MAX_REPLY - 1) + '…';
}
