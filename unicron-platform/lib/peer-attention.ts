// lib/peer-attention.ts — Sprint 5 Stream D
// Bounded peer attention via Supabase Realtime channels.
//
// Each agent or Cowork session subscribes to a named channel filtered by topic.
// No global broadcast — each subscriber declares its own scope.
//
// Channel naming: `peer-attention:{agent_id}`
// Topic filtering: client-side (msg.topic must be in watch.topics)

import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PeerWatch {
  /** The subscribing agent's own ID (used to build the channel name). */
  agent_id: string;
  /** Topics this agent cares about; messages on other topics are silently dropped. */
  topics: string[];
  /** Called for every matching inbound message. */
  on_message: (msg: PeerMessage) => void;
}

export interface PeerMessage {
  from_agent_id: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Internal Supabase client (lazy — only created when this module is used)
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

/**
 * Subscribe to peer attention messages for a given agent.
 *
 * Returns the active RealtimeChannel. Keep a reference to call
 * unsubscribePeerAttention() on session end.
 *
 * @param watch - PeerWatch declaration (agent_id, topics, on_message)
 */
export function subscribePeerAttention(watch: PeerWatch): RealtimeChannel {
  const supabase = getSupabase();
  const channelName = `peer-attention:${watch.agent_id}`;

  const channel = supabase.channel(channelName);

  channel.on(
    'broadcast',
    { event: 'peer_message' },
    ({ payload }: { payload: unknown }) => {
      // Type-guard the incoming payload
      if (!isPeerMessage(payload)) return;

      // Client-side topic filter — no global firehose
      if (!watch.topics.includes(payload.topic)) return;

      watch.on_message(payload);
    }
  );

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log(`[peer-attention] ${watch.agent_id} subscribed on ${channelName}`);
    } else if (status === 'CHANNEL_ERROR') {
      console.error(`[peer-attention] Channel error on ${channelName}`);
    }
  });

  return channel;
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

/**
 * Unsubscribe and remove the Realtime channel.
 * Call this on session end / agent teardown.
 */
export function unsubscribePeerAttention(channel: RealtimeChannel): void {
  channel.unsubscribe();
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

/**
 * Broadcast a message to all agents watching the named target channel.
 *
 * The target channel is `peer-attention:{to_agent_id}` — the recipient
 * must already be subscribed. Topic filtering happens on the subscriber side.
 *
 * @param supabase       - Supabase client (caller supplies so no singleton required)
 * @param from_agent_id  - Sending agent's ID
 * @param to_agent_id    - Receiving agent's ID (matches their subscribed channel)
 * @param topic          - Topic string; must match receiver's declared topics
 * @param payload        - Arbitrary JSON payload
 */
export async function broadcastToPeers(
  supabase: ReturnType<typeof createClient>,
  from_agent_id: string,
  to_agent_id: string,
  topic: string,
  payload: Record<string, unknown>
): Promise<void> {
  const channelName = `peer-attention:${to_agent_id}`;
  const channel = supabase.channel(channelName);

  const message: PeerMessage = {
    from_agent_id,
    topic,
    payload,
    timestamp: new Date().toISOString(),
  };

  const result = await channel.send({
    type: 'broadcast',
    event: 'peer_message',
    payload: message,
  });

  if (result !== 'ok') {
    console.error(
      `[peer-attention] broadcast from ${from_agent_id} → ${to_agent_id} failed:`,
      result
    );
  }

  // Remove the ephemeral send-only channel
  channel.unsubscribe();
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isPeerMessage(val: unknown): val is PeerMessage {
  if (typeof val !== 'object' || val === null) return false;
  const v = val as Record<string, unknown>;
  return (
    typeof v['from_agent_id'] === 'string' &&
    typeof v['topic'] === 'string' &&
    typeof v['payload'] === 'object' &&
    v['payload'] !== null &&
    typeof v['timestamp'] === 'string'
  );
}
