// lib/connectors/teams/conversations.ts — capture + retrieve Bot Framework
// conversation references on the connectors.metadata jsonb.
//
// SPEC § 4.2 says "Bot must be added to a team or channel before it can
// post there." We persist the conversation reference (serviceUrl + id)
// when the bot first sees a `conversationUpdate.membersAdded` event so
// the dispatcher can post proactively later.
//
// Storage model (no new table):
//   connectors.metadata.teams = {
//     bot_id: string,
//     bot_name: string,
//     tenant_id: string,
//     conversations: [
//       {
//         id: string,        // Teams conversation id
//         serviceUrl: string,
//         tenantId: string,
//         conversationType: 'personal' | 'channel' | 'groupChat',
//         channelId?: string,
//         user_aad_id?: string, // for personal chats
//         updated_at: string
//       }
//     ]
//   }
//
// We cap the array at 200 conversations per connector (FIFO eviction);
// for v1 multi-org pilots (1 org → ~50 reps), this is plenty. If a
// customer outgrows it we'll move to a dedicated `teams_conversations`
// table (migration 0109 reserved in the dispatch prompt).

import { supabaseAdmin } from '@/lib/supabase';

export interface TeamsConversationRef {
  id: string;
  serviceUrl: string;
  tenantId: string;
  conversationType: 'personal' | 'channel' | 'groupChat';
  channelId?: string;
  user_aad_id?: string;
  updated_at: string;
}

const MAX_CONVERSATIONS = 200;

interface MetadataRow {
  metadata: Record<string, unknown> | null;
}

interface TeamsMetadata {
  bot_id?: string;
  bot_name?: string;
  tenant_id?: string;
  conversations?: TeamsConversationRef[];
}

function readTeamsMetadata(metadata: Record<string, unknown> | null | undefined): TeamsMetadata {
  if (!metadata) return {};
  const tm = (metadata as { teams?: TeamsMetadata }).teams;
  return tm ?? {};
}

export async function upsertConversationRef(
  connectorId: string,
  ref: TeamsConversationRef,
): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: MetadataRow | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const cur = await sb.from('connectors').select('metadata').eq('id', connectorId).maybeSingle();
  if (cur.error || !cur.data) return; // fail-open

  const existingMetadata = (cur.data.metadata ?? {}) as Record<string, unknown>;
  const teams = readTeamsMetadata(existingMetadata);
  const conversations = (teams.conversations ?? []).filter((c) => c.id !== ref.id);
  conversations.unshift(ref);
  if (conversations.length > MAX_CONVERSATIONS) {
    conversations.length = MAX_CONVERSATIONS;
  }

  const newMeta = {
    ...existingMetadata,
    teams: {
      ...teams,
      conversations,
    },
  };
  await sb.from('connectors').update({ metadata: newMeta }).eq('id', connectorId);
}

export async function getConversationRef(
  connectorId: string,
  conversationId: string,
): Promise<TeamsConversationRef | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: MetadataRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const cur = await sb.from('connectors').select('metadata').eq('id', connectorId).maybeSingle();
  if (cur.error || !cur.data) return null;
  const teams = readTeamsMetadata(cur.data.metadata);
  return (teams.conversations ?? []).find((c) => c.id === conversationId) ?? null;
}

/** Resolve a conversation by its routing-rule channel id. The dispatcher
 *  uses this to look up the (serviceUrl, conversationId) pair when it
 *  needs to post outbound to a stored channel. */
export async function getConversationRefByChannelId(
  connectorId: string,
  channelId: string,
): Promise<TeamsConversationRef | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: MetadataRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const cur = await sb.from('connectors').select('metadata').eq('id', connectorId).maybeSingle();
  if (cur.error || !cur.data) return null;
  const teams = readTeamsMetadata(cur.data.metadata);
  return (
    (teams.conversations ?? []).find(
      (c) => c.channelId === channelId || c.id === channelId,
    ) ?? null
  );
}
