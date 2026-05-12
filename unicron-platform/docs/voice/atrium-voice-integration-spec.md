# Atrium x Voice Agents — Integration Spec (v2, Vite-grounded)

Status: Ready to execute
Source repo: github.com/freakngenius/unicron-voice-prototype (private, Next.js App Router)
Target repo: unicron-platform/ (Vite + React 19 + Vercel serverless funcs)
Surface: atrium.unicron.systems → Products tab → Voice Agents sub-tab (third sub-tab, to the right of Metacron)
Sprint: 5, Stream A
Supersedes: _archive/v1-perplexity-handoff-2026-05-10.md (Next.js-shaped; halted by Claude Code recon 2026-05-12)
Authored: Kyle (Cowork) 2026-05-12, grounded in Claude Code recon of unicron-platform HEAD

## 0. Why v2 exists

v1 assumed Atrium was Next.js App Router because the prototype is. Recon confirmed Atrium is Vite + Vercel serverless funcs, with state-driven tab navigation in src/atrium/AtriumApp.tsx (no router, no URL paths for sub-pages). The lift is a translation across two paradigms, not a 1:1 copy. v2 bakes the translation in.

## 1. Stack reality (the things we are translating between)

Prototype (source):
- Next.js 14 App Router
- API: src/app/api/<path>/route.ts handlers exporting GET/POST/PATCH/DELETE
- Pages: src/app/<path>/page.tsx, URL-routed
- Auth: requireBuilderAuth() — a no-op in prod
- Supabase: imported as supabaseAdmin from src/lib/supabase
- Custom V3 shell (V3AppShell + V3PageBody + V3VoiceTabs) wraps every page

Atrium (target):
- Vite + React 19, build output is an SPA
- API: unicron-platform/api/<path>.ts — Vercel serverless funcs, one file per route, default export async function handler(req: VercelRequest, res: VercelResponse): Promise<void>
- UI: src/atrium/<tab>/*.tsx components, mounted via state in AtriumApp.tsx (activeTab === 'products' renders <ProductsTab />). No URL routing for tabs or sub-tabs.
- Rail config: src/atrium/AtriumLayout.tsx, TABS array of { id, label, sprint }
- Auth (browser): build-time VITE_ATRIUM_EMAIL_ALLOWLIST env var, signs user out client-side if not on list
- Auth (server): NONE TODAY on api/atrium/*.ts handlers. This is a security gap voice will close.
- Supabase (browser): src/lib/supabase.ts getSupabase() returns anon client
- Supabase (server): each handler inlines createClient(url, SUPABASE_SERVICE_ROLE_KEY) via getServiceClient()
- Atrium has its own shell already (src/atrium/AtriumLayout.tsx). Discard the prototype's V3AppShell entirely.
- Migrations: unicron-platform/supabase/migrations/YYYYMMDD_snake_case.sql
- vercel.json: framework=vite, SPA rewrite for non-/api/* paths, no region pin, no per-route body-parser config

## 2. Surface placement

Voice lives INSIDE the Products tab as a third sub-tab. Final sub-tab order inside Products:

  Pathfinder · Metacron · Voice Agents

Inside Voice Agents, there are three further sub-tabs (state-driven, no URL): Agents · Campaigns · Activity. These match the prototype's V3VoiceTabs sub-nav.

Implementation:
- src/atrium/products/ProductsTab.tsx (or whatever the existing Products component is) gains a third sub-tab. Sub-tab state lives in component-local useState. The Pathfinder and Metacron sub-tabs stay unchanged in order and behavior.
- src/atrium/products/voice/VoiceTab.tsx is the new component. It renders the second-level sub-tab nav (Agents/Campaigns/Activity) and dispatches to:
  - src/atrium/products/voice/VoiceAgentsView.tsx
  - src/atrium/products/voice/VoiceCampaignsView.tsx
  - src/atrium/products/voice/VoiceActivityView.tsx
- No additions to the top-level TABS array in AtriumLayout.tsx. Voice is not a top-level tab.

If the Products tab does not yet have an internal sub-tab structure, Claude Code creates one in this same branch, matching whatever pattern Atrium uses elsewhere (e.g., the System tab's sub-pages if it has any). The pattern must be reusable for a future fourth sub-tab.

## 3. Database schema

Supabase project: anfihcusvekpovcchpoh (shared with Pathfinder). Migration goes in unicron-platform/supabase/migrations/<YYYYMMDD>_voice_atrium_integration.sql.

Tables (all idempotent, IF NOT EXISTS):

- pathfinder.voice_agent_sources
- pathfinder.voice_call_transcripts
- pathfinder.voice_call_attempts
- pathfinder.customer_call_extractions
- pathfinder.procurement_pull_configs
- metacron.operator_allowlist

The first five mirror the prototype's existing tables in the same project, so the migration is a no-op if they already exist. The sixth, metacron.operator_allowlist, is NEW and replaces the spec v1 plan to use pathfinder.operator_allowlist. Rationale: internal operator gating belongs in the Metacron schema, not the customer-facing Pathfinder schema. The existing RLS reference in src/lib/customersClient.ts:133 stays unchanged (it gates customer-row visibility, a different concern).

DDL for the new allowlist:

```sql
CREATE SCHEMA IF NOT EXISTS metacron;

CREATE TABLE IF NOT EXISTS metacron.operator_allowlist (
  email text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('founder','advisor','team')),
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  notes text
);

ALTER TABLE metacron.operator_allowlist ENABLE ROW LEVEL SECURITY;
-- No anon policies. Service role only.

INSERT INTO metacron.operator_allowlist (email, role, added_by, notes) VALUES
  ('kyle@unicron.systems',   'founder', 'spec-v2', 'Sprint 5 Stream A seed'),
  ('keenan@unicron.systems', 'founder', 'spec-v2', 'Sprint 5 Stream A seed'),
  ('curtis@unicron.systems', 'advisor', 'spec-v2', 'Sprint 5 Stream A seed'),
  ('team@unicron.systems',   'team',    'spec-v2', 'Sprint 5 Stream A seed')
ON CONFLICT (email) DO NOTHING;
```

ALTER on pathfinder.customers (idempotent):

```sql
ALTER TABLE pathfinder.customers
  ADD COLUMN IF NOT EXISTS facts jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS facts_updated_at timestamptz;

COMMENT ON COLUMN pathfinder.customers.facts IS 'Rolled-up structured facts from voice calls. Buckets: decision_makers, pain_points, budget_signals, timing_signals, competitors, next_action. Each fact carries last_seen_at + source_call_id + confidence.';
```

mock_mode cleanup (per v1 spec section 9.5):

```sql
ALTER TABLE pathfinder.voice_agent_sources
  ALTER COLUMN mock_mode SET DEFAULT false;
-- Or DROP COLUMN if not referenced anywhere in the prototype code.
```

Migration verification: SELECT 1 from each of the six tables; SELECT column_name from information_schema for the customers ALTER; SELECT count(*) from metacron.operator_allowlist returns 4.

## 4. Server-side auth (net-new infra)

Voice ships with proper auth. The existing api/atrium/* handlers will be retrofitted in a follow-up sprint to use the same helper.

New file: unicron-platform/api/_lib/voiceAuth.ts

Contract:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export type VoiceAuthOk = { ok: true; email: string; role: 'founder'|'advisor'|'team' };
export type VoiceAuthDeny = { ok: false; status: number; message: string };

export async function requireVoiceAccess(
  req: VercelRequest,
  res: VercelResponse
): Promise<VoiceAuthOk | VoiceAuthDeny> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'missing bearer token' };
  }
  const jwt = authHeader.slice('Bearer '.length);

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return { ok: false, status: 500, message: 'supabase env missing' };
  }

  // Verify the JWT against Supabase auth.
  const authClient = createClient(url, anonKey);
  const { data: userData, error } = await authClient.auth.getUser(jwt);
  if (error || !userData?.user?.email) {
    return { ok: false, status: 401, message: 'invalid token' };
  }
  const email = userData.user.email.toLowerCase();

  // Allowlist check via service role.
  const sb = createClient(url, serviceKey);
  const { data: row } = await sb
    .from('operator_allowlist')
    .select('role')
    .eq('email', email)
    .maybeSingle();
  if (!row) {
    return { ok: false, status: 403, message: 'not on allowlist' };
  }

  return { ok: true, email, role: row.role };
}

export function denyResponse(res: VercelResponse, deny: VoiceAuthDeny): void {
  res.status(deny.status).json({ error: deny.message });
}
```

Note: the SELECT targets `operator_allowlist` in the metacron schema. The handler's supabase client must point at the metacron schema, either by `.schema('metacron').from('operator_allowlist')` or by setting search_path on the client. Resolve to whichever the supabase-js version in unicron-platform supports.

Every /api/voice/* handler calls requireVoiceAccess at the top and short-circuits on deny. Exception: /api/voice/webhook/vapi uses HMAC signature verification with VAPI_WEBHOOK_SECRET, not the bearer flow.

Browser-side: Atrium components calling /api/voice/* must include the user's Supabase access token in the Authorization header. Pattern:

```ts
const { data: { session } } = await getSupabase().auth.getSession();
const token = session?.access_token;
const res = await fetch('/api/voice/sources', {
  headers: { Authorization: `Bearer ${token}` }
});
```

Add a small helper in src/atrium/lib/voiceFetch.ts to centralize this.

## 5. API surface translation

All prototype routes from v1 section 1.2 translate into Vercel serverless funcs. Path mapping (URL stays the same, file shape changes):

- /api/voice/sources              → api/voice/sources.ts (GET list, POST create)
- /api/voice/sources/[id]/publish → api/voice/sources/[id]/publish.ts (POST)
- /api/voice/voices               → api/voice/voices.ts (GET)
- /api/voice/voices/preview       → api/voice/voices/preview.ts (POST)
- /api/voice/dispatch             → api/voice/dispatch.ts (POST)
- /api/voice/web-call/config      → api/voice/web-call/config.ts (GET)
- /api/voice/webhook/vapi         → api/voice/webhook/vapi.ts (POST, HMAC, raw body)
- /api/voice/transcripts          → api/voice/transcripts.ts (GET)
- /api/voice/transcripts/[id]     → api/voice/transcripts/[id].ts (GET)
- /api/voice/transcripts/[id]/review → api/voice/transcripts/[id]/review.ts (POST)
- /api/voice/extractions          → api/voice/extractions.ts (GET)
- /api/voice/extractions/run      → api/voice/extractions/run.ts (POST)
- /api/voice/customers            → api/voice/customers.ts (GET)
- /api/voice/use-cases            → api/voice/use-cases.ts (GET)
- /api/voice/cron-attempts        → api/voice/cron-attempts.ts (GET)
- /api/voice/procurement-configs  → api/voice/procurement-configs.ts (GET, POST)
- /api/voice/calls/active         → api/voice/calls/active.ts (GET)
- /api/voice/activity             → api/voice/activity.ts (GET)
- /api/cron/voice/procurement-pull → api/cron/voice/procurement-pull.ts (POST, CRON_SECRET)

Each handler:
1. Switches on req.method, returns 405 for unsupported methods.
2. Calls requireVoiceAccess (except webhook + cron, which use their own secrets).
3. Inlines its supabase service client OR pulls from a new shared helper api/_lib/supabaseAdmin.ts (recommended, since Atrium's existing handlers each duplicate getServiceClient — create the shared helper as part of this PR and refactor at least the voice handlers to use it; do not retroactively change api/atrium/* in this branch).
4. Sets CORS headers if needed (Atrium serves from same origin so likely no CORS, but match the existing api/atrium/* pattern).

Skipped (legacy aliases): /api/voice/assistants, /api/voice/leads (and the prototype's bare /api/sources).

## 6. Webhook raw body handling

Vapi signs the raw request body. Vercel's default Node runtime auto-parses JSON, which corrupts the signature check.

For api/voice/webhook/vapi.ts:

```ts
export const config = {
  api: { bodyParser: false }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = await new Promise<string>((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
  // verify HMAC signature against raw, then JSON.parse(raw)
}
```

Document the bodyParser:false in the handler file header. This is the only voice route that disables body parsing.

## 7. Lib copy plan

Copy from prototype src/lib/ into unicron-platform/src/lib/voice/:

- vapi.ts (buildAssistantPayload, createOrUpdateVapiAssistant, types)
- anthropic.ts (minimal fetch-based Anthropic client)
- extraction.ts (generator + verifier + buildFactsPatch)
- llmCatalog.ts (Vapi-supported LLM dropdown options + providerForModel)
- systemPrompt.ts (default templates)
- procurementIngest.ts (post-call data ingest for procurement campaigns)
- allowlist.ts (phone number gating, NOT operator allowlist — different concern)

Skip: apiAuth.ts (replaced by requireVoiceAccess), hubspot.ts (Atrium has its own), supabase.ts (Atrium has its own client at src/lib/supabase.ts).

For every copied lib that imports supabaseAdmin from '@/lib/supabase', rewrite the import to use Atrium's pattern (either the new api/_lib/supabaseAdmin.ts shared helper if the lib runs server-side, or src/lib/supabase.ts getSupabase() if browser-side).

## 8. UI component plan

Discard entirely: src/components/atrium-v3/AppShell.tsx (V3AppShell). Atrium has its own shell (src/atrium/AtriumLayout.tsx).

Keep, copy into unicron-platform/src/atrium/products/voice/components/:

- V3PanelCard (from prototype src/components/atrium-v3/primitives.tsx)
- V3FieldRow
- V3InputStyle
- V3GatedAction
- V3StatusPill (from AppShell.tsx exports)
- V3Btn (same)
- V3PageBody (same — used as page-body wrapper inside the Voice sub-tab, not as a top-level shell)
- V3PageTitle (same)
- V3VoiceTabs (same — the sub-nav for Agents/Campaigns/Activity)
- v3toast helper

Icons (src/components/atrium/icons.tsx) get copied to unicron-platform/src/atrium/products/voice/components/icons.tsx UNLESS Atrium already has overlapping icon names; in which case reconcile by namespacing (VoiceIcon* or similar).

Skip: V1 dark-theme components (src/components/atrium/AppShell.tsx, src/components/atrium/primitives.tsx).

## 9. CSS plan

New file: unicron-platform/src/atrium/styles/voice-v3.css

Contains the prototype's .atrium-v3 block (extracted from src/app/globals.css). Import location: src/main.tsx or wherever atrium-tokens.css is imported globally — add the voice-v3.css import on the next line.

All voice-v3 styles MUST be scoped under .atrium-v3 (the existing class prefix) so they do not leak into other Atrium tabs. The voice components wrap their root render in `<div className="atrium-v3">` to opt into the scope.

Do NOT append voice styles to src/index.css or src/atrium/styles/atrium-tokens.css — keep them isolated.

## 10. Page → component translation

Three prototype pages translate into three Atrium components inside the Voice sub-tab. They render inline as the active sub-sub-tab; they are NOT routes.

- src/app/agents/page.tsx     → src/atrium/products/voice/VoiceAgentsView.tsx
- src/app/campaigns/page.tsx  → src/atrium/products/voice/VoiceCampaignsView.tsx
- src/app/activity/page.tsx   → src/atrium/products/voice/VoiceActivityView.tsx

Translation rules:
- Remove the V3AppShell wrapper. The parent (VoiceTab.tsx) provides the V3PageBody wrapper and V3VoiceTabs sub-nav.
- Remove any Next.js-specific imports (next/link, next/navigation, next/headers, etc.). Replace useRouter with the existing Atrium navigation event bus (src/atrium/navigation.ts) if cross-tab jumps are needed.
- Replace any direct fetch('/api/voice-sources') (without auth header) with voiceFetch('/api/voice/sources') from src/atrium/lib/voiceFetch.ts, which injects the bearer token.
- Replace 'use client' / 'use server' directives with plain function components — Atrium has no RSC boundary.
- Replace dynamic route segment imports ({ params }: { params: { id: string } }) with React state passed from the parent view.

## 11. Environment variables

Add to unicron-platform Vercel project (all environments unless noted):

- VAPI_API_KEY                         (server-only)
- VAPI_PHONE_NUMBER_ID                 a8715195-ef33-4ac5-978f-a5b4673e4753
- VAPI_FROM_NUMBER                     +17377026283
- VAPI_WEBHOOK_SECRET                  freshly generated random hex (32+ bytes; do NOT reuse prototype's value)
- NEXT_PUBLIC_VAPI_PUBLIC_KEY          2720b3ed-eba0-4843-a6ca-8294c37017e7  (renamed to VITE_VAPI_PUBLIC_KEY for Vite exposure — Vite uses VITE_ prefix, not NEXT_PUBLIC_)
- ELEVENLABS_API_KEY                   (server-only)
- ELEVENLABS_MODEL                     eleven_turbo_v2_5
- ELEVENLABS_VOICE_ID                  IKne3meq5aSn9XLyUdCD
- ANTHROPIC_API_KEY                    (server-only, already present for nervous-system agents)
- SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (already present)
- VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (browser, already present)
- CRON_SECRET                          (already present)
- VOICE_ALLOWLIST                      comma-separated E.164 numbers — hard whitelist of phones the system may dial

Rename note: NEXT_PUBLIC_* won't surface to the Vite client. The browser code that reads the Vapi public key must read it from import.meta.env.VITE_VAPI_PUBLIC_KEY. Update lib copy in step 7 accordingly.

## 12. Vapi cutover (Prompt 02 territory)

Three live assistants need server.url repointed from unicron-voice-prototype.vercel.app to atrium.unicron.systems:

- SDR / Top of Funnel: assistant 11b21486-1b59-4132-b852-aaed7031bee1, source 848cabc3-bf1a-4794-ba6d-38e2bcd469b0
- Procurement Weekly Check-in: assistant 76b24aed-f653-4744-b09a-f95d018e471b, source f46679d9-458c-4bd2-a5e9-ba0d1c0465a3 (zedcor)
- Procurement Records Pull: assistant ad95307e-4a73-4d1f-aff7-358eb3b4393e, source 180b22b4-4bcc-487a-b8a1-9c3b6d1197c6 (zedcor)
- Discovery (unpublished): no repoint needed

Phone number (+17377026283) stays put.

Two repoint paths:
- Path A: re-publish via POST /api/voice/sources/{id}/publish from Atrium prod (with bearer token). The publish handler derives server.url from req.headers.host. Preferred.
- Path B: direct PATCH api.vapi.ai/assistant/{id} with new server.url + new VAPI_WEBHOOK_SECRET.

Auto-revert: if smoke fails, PATCH all three assistants back to https://unicron-voice-prototype.vercel.app/api/webhook/vapi so production calls keep working on the prototype while debugging.

## 13. Known issues to fix during integration

1. Placeholder guard: prototype's publish route refuses placeholder strings, but Discovery agent in DB still has PLACEHOLDER_SYSTEM_PROMPT. Voice configure UI must refuse to enable Publish until replaced.
2. Two writers on pathfinder.customers.facts: Pathfinder and the extraction pipeline both write. Confirm no race on facts_updated_at. If real, switch to per-bucket jsonb_set.
3. voice_call_transcripts.transcript jsonb shape unenforced. Add CHECK constraint or zod-validate on insert.
4. No retention policy on voice_call_transcripts audio URLs (Vapi-hosted). Decide if Atrium needs to mirror recordings for compliance — flag, do not block.
5. voice_agent_sources.mock_mode default — handled in section 3 migration.

## 14. Out of scope (post-Prompt-02 followups)

- Retrofit api/atrium/*.ts handlers to call requireVoiceAccess (closes the existing security gap).
- Move requireVoiceAccess to api/_lib/operatorAuth.ts and generalize the name once it gates more than voice.
- Pathfinder Cmd+Shift+P provenance toggle (separate repo).
- Multi-tenant org scoping: voice_agent_sources.customer_org_id text → uuid join.
- Cost tracking: Vapi + ElevenLabs + Anthropic spend per call writes to agent_log or equivalent.
- Recording playback in Atrium with scrubbing.

## 15. Spec location convention

This file lives canonically at Company Docs/Specs/atrium-voice/atrium-voice-integration-spec.md in the Cowork activity hub. Prompt 01 copies it into the repo at unicron-platform/docs/voice/atrium-voice-integration-spec.md on the foundation branch, so Claude Code can read it via repo-relative path during execution. The Cowork hub stays authoritative; the repo copy is a snapshot tied to the merge commit.

## 16. Quick reference

- Prototype repo: https://github.com/freakngenius/unicron-voice-prototype (private, archive after Prompt 02)
- Prototype prod: https://unicron-voice-prototype.vercel.app (redirect-only after Prompt 02)
- Atrium prod: https://atrium.unicron.systems
- Supabase project: anfihcusvekpovcchpoh
- Pathfinder schema: pathfinder.* (voice tables + customers)
- Metacron schema: metacron.* (operator_allowlist — NEW)
- Vercel project (target): unicron-platform
- Git author: freakngenius / freakngenius@users.noreply.github.com
- Kanban: Internal Org Kanban (NOTION_DB_INTERNAL_KANBAN)
