# SPEC Addendum 8 - Atrium Companion

**Status:** Draft for engineer + Master Conductor handoff
**Parent SPECs:** SPEC - Unicron Nervous System.md, Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md
**Depends on:** the existing ingest pipeline (Sprint 4, voice memo path live)
**Date:** 2026-05-14
**Owner:** Kyle Kesterson
**Parent PRD:** PRD - Procedural Memory & Skill Forge.md

Atrium Companion is a thin gateway that lets the three of us (Kyle, Keenan, Curtis) capture into Atrium from anywhere via Telegram, Signal, and SMS. A voice memo, text, or photo lands as a structured ingest row, attributed to the founder, visible on the next morning's Now tab. Customers never see this. There is no tenancy here. It is the founders' personal layer.

Merge into the parent SPEC's ingest pipeline section at v0.6 after Sprint 12 ships.

---

## 1. Out of scope (Phase 1)

State these so the engineer and the Master Conductor do not drift:

- Customer use. Internal-only.
- Bidirectional chat with Atrium agents from these channels. Capture-in only.
- Group chats or shared threads.
- Anything that touches a `customer_id`.
- Extension beyond the three founders.

---

## 2. Architecture

```
Telegram Bot   --+
Signal-CLI     --+--> Atrium Companion gateway (Vercel function, or small Fly app
Twilio SMS     --+     if Vercel cold-start hurts on Telegram webhooks)
                                  |
                                  v
                  nervous_system.founder_captures
                                  |
                                  v
                  Existing ingest pipeline -> ledger
                                  |
                                  v
                        Now tab Quick Capture surface
```

The Companion reuses the existing ingest pipeline and the existing Deepgram transcript path from Sprint 4. It is a new front door, not a new pipeline.

---

## 3. Schema

Net-new table in the `nervous_system` schema. Query `information_schema` for the live `nervous_system.team_members` shape before writing the foreign key.

```sql
CREATE TABLE nervous_system.founder_captures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id     uuid NOT NULL REFERENCES nervous_system.team_members(id),
  channel        text NOT NULL CHECK (channel IN ('telegram','signal','sms')),
  channel_msg_id text,
  kind           text NOT NULL CHECK (kind IN ('text','voice','image')),
  raw_payload    jsonb NOT NULL,        -- exact upstream payload
  transcript     text,                  -- Deepgram output for voice
  structured     jsonb,                 -- LLM-structured intent
  ledger_id      uuid,                  -- pointer once written through to the ledger
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX founder_captures_founder_idx ON nervous_system.founder_captures(founder_id, created_at DESC);
ALTER TABLE nervous_system.founder_captures ENABLE ROW LEVEL SECURITY;
```

RLS: a founder reads only their own captures. No cross-founder visibility unless a capture is explicitly promoted to a Cowork thread. Service role writes.

---

## 4. Auth

Static signed token per founder, baked into the Telegram, Signal, and SMS bot configs. Each inbound message is matched against the sender's channel-specific identity, which maps to a `founder_id`. An unknown sender is a silent drop plus an alert to `#alerts-companion`.

Magic Link tied to a Telegram `user_id` is cleaner long-term. Punt it to Phase 2. The static signed token is the Phase 1 decision.

---

## 5. Processing

1. An inbound message arrives on one of the three channels.
2. The gateway verifies the sender against the `founder_id` mapping. Unknown: drop plus alert.
3. If voice: run Deepgram (the existing Sprint 4 path) for a transcript. Store both `raw_payload` and `transcript`.
4. An LLM classifier (Haiku-tier, cheap) emits the `structured` JSON: `{kind, summary, suggested_action, tags}`.
5. Write the `nervous_system.founder_captures` row.
6. Call the existing ingest pipeline with `source = 'founder_capture'` and `author = founder_id`. It writes to the ledger. The ledger surfaces on the Now tab and is searchable via session memory.
7. Reply on the same channel with a one-line confirmation: "Got it. (todo / idea / decision / observation)" plus an Atrium permalink.

---

## 6. Failure modes

- Channel API rate limit: exponential backoff, drop after 5 attempts, alert to `#alerts-companion`.
- Transcript fails: store the raw payload, surface as `kind = 'voice'` with no transcript on the Now tab.
- LLM classifier fails: write the capture without `structured`, surface as raw on the Now tab.
- Ingest write fails: leave the capture row, mark it for retry, alert.

The webhook providers (Telegram, Signal, Twilio) all retry on a non-2xx response. If the gateway is down, captures are not lost: the providers redeliver once it is back.

---

## 7. Acceptance scenarios (Addendum 4 style)

Stored at `vault/wiki/scenarios/atrium-companion/`. Satisfaction threshold 0.85.

- **S8.1** Kyle voice-memos into Telegram. A transcript plus structured intent appear on his Now tab within 30 seconds.
- **S8.2** Keenan SMS-texts a one-liner. It lands as `kind = 'text'` with classified intent.
- **S8.3** A capture from Kyle is invisible to Keenan and to Curtis, and vice versa, unless promoted to a Cowork thread.
- **S8.4** An unknown sender's Telegram message is dropped and logged. No row is written.
- **S8.5** The Companion gateway goes down. No captures are lost: Telegram, Signal, and Twilio webhook retries succeed within 5 minutes once the gateway is restored.

---

## 8. What this addendum does NOT do

- It does not let customers capture into anything. Internal-only, three founders.
- It does not support replying to or chatting with Atrium agents from the channel. Capture-in only.
- It does not introduce a new transcript or ingest pipeline. It reuses Sprint 4's.
- It does not touch `customer_id`. Founder captures cannot land in a customer tenant by construction.

End Addendum 8.
