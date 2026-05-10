# Peer Attention — Bounded Subscription Rules

Each Cowork chat session declares peer watches in its session-start memory load.
Persistent agents declare in `agents.config.watches_agents[]` and `watches_signal_topics[]`.

No global broadcast. No firehose. Every subscriber declares explicit scope.

## Subscription rules

| Agent / Chat | Watches | Topics |
|--------------|---------|--------|
| Orchestrator | all agents | escalations, status_updates |
| Analyst | Elder, Orchestrator | continuity_entries, audit_flags |
| Cowork chats | Orchestrator, Elder | action_items, taboo_alerts |
| Internal Org chat | Pathfinder, Metacron, Sales | all |
| Pathfinder chat | Internal Org, Metacron | all |
| Metacron chat | Internal Org, Pathfinder | all |
| Sales chat | Internal Org, Pathfinder | all |

## Session start behavior

Each Cowork chat reads the peer's last session-end summary at startup:

```
vault/Memory/cowork/<chat_name>/latest.md
```

If the file does not exist, skip silently — peer may not have run yet.

## Persistent agent config

Agents declare watches in `nervous_system.agents.config`:

```json
{
  "watches_agents": ["<agent_id>"],
  "watches_signal_topics": ["pathfinder.demo_polish", "metacron.architect"]
}
```

Persistent agents use Supabase Realtime channels (see `lib/peer-attention.ts`).
Cowork-to-Cowork attention uses file reads at session start (no live channel needed).

## Channel naming convention

Supabase Realtime channels follow the pattern:

```
peer-attention:{agent_id}
```

Senders target a specific receiver by sending to that channel. Topic filtering
is client-side — receivers silently drop messages on non-declared topics.

## API

```typescript
import {
  subscribePeerAttention,
  unsubscribePeerAttention,
  broadcastToPeers,
} from 'unicron-platform/lib/peer-attention';

// Subscribe (call at agent session start)
const channel = subscribePeerAttention({
  agent_id: 'analyst',
  topics: ['continuity_entries', 'audit_flags'],
  on_message: (msg) => { /* handle */ },
});

// Broadcast to a peer
await broadcastToPeers(supabase, 'orchestrator', 'analyst', 'audit_flags', {
  flag: 'drift_detected',
  ledger_id: 'abc-123',
});

// Unsubscribe (call at agent session end)
unsubscribePeerAttention(channel);
```

## Sprint 6 work

- Wire all Cowork peer subscriptions per this table (Sprint 5 wires infra; Sprint 6 wires all sessions)
- Add topic registry to `nervous_system.agents.config` schema
- Emit `status_updates` from Orchestrator on every action item state change
