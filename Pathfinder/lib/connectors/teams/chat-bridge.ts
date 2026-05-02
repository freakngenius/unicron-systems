// lib/connectors/teams/chat-bridge.ts — adapter from Teams inbound chat
// (@-mention or DM) to the Pathfinder chat handler. Mirrors
// lib/connectors/slack/chat-bridge.ts.
//
// Same contract: text in → string reply out. C-2A ships a structurally
// complete bridge proving the routing path; the actual Sonar invocation
// is gated behind a follow-up so OAuth + webhook + adaptive cards work
// isn't blocked on chat-streaming refactors.

import { stripMention } from '@/lib/connectors/teams/commands';

export interface BridgeMessageArgs {
  text: string;
  /** Bot display name so we can strip leading mentions. */
  botName: string | null;
}

export interface BridgeMessageResult {
  reply: string;
  /** True when the chat path was reached; false on empty / parse failure. */
  routed: boolean;
}

const MAX_REPLY = 1200;

export async function routeChatMessage(args: BridgeMessageArgs): Promise<BridgeMessageResult> {
  const cleaned = stripMention(args.text, args.botName);
  if (cleaned.length === 0) {
    return {
      reply:
        "Hi — I'm Pathfinder. Ask me about leads, or `@Pathfinder leads` for a quick view.",
      routed: false,
    };
  }
  return {
    reply:
      `Got it — "${cleaned.slice(0, 200)}"\n` +
      `(C-2A v1: Pathfinder chat over Teams acknowledges your message; full Sonar bridge ships next.) ` +
      `Try \`@Pathfinder leads\` for live data right now.`,
    routed: true,
  };
}

export function clipReply(s: string): string {
  if (s.length <= MAX_REPLY) return s;
  return s.slice(0, MAX_REPLY - 1) + '…';
}
