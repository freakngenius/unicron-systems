# Voice integration — env vars required on the unicron-platform Vercel project

Per spec §11. These must be present in **Preview + Production** scopes before
the `atrium-voice-integration-v2` PR is merged + deployed. The PR's preview
deploy will still build without them, but voice handlers will 500.

## Server-only (do not expose to client)

| Key | Value / Notes |
|---|---|
| `VAPI_API_KEY` | From Vapi dashboard, server-side only. |
| `VAPI_PHONE_NUMBER_ID` | `a8715195-ef33-4ac5-978f-a5b4673e4753` (per spec §11) |
| `VAPI_FROM_NUMBER` | `+17377026283` |
| `VAPI_WEBHOOK_SECRET` | **Freshly generated** random hex (32+ bytes). Do NOT reuse the prototype's value. Prompt 02 uses this when repointing assistants. |
| `ELEVENLABS_API_KEY` | Server-only. |
| `ELEVENLABS_MODEL` | `eleven_turbo_v2_5` |
| `ELEVENLABS_VOICE_ID` | `IKne3meq5aSn9XLyUdCD` |
| `ANTHROPIC_API_KEY` | Already present (nervous-system agents). Confirm scope covers production. |
| `SUPABASE_URL` | Already present. |
| `SUPABASE_ANON_KEY` | Already present. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already present. |
| `CRON_SECRET` | Already present. |
| `VOICE_ALLOWLIST` | Comma-separated E.164 phone numbers. Hard whitelist of phones the system may dial. Required as a global circuit breaker — set to a known-safe test number while bringing up; production set per `voice_agent_sources.allowlist_phones`. |
| `INTERNAL_VOICE_DISPATCH_TOKEN` | **Optional / follow-up:** if set, `api/cron/voice/procurement-pull.ts` passes it as `Authorization: Bearer ...` to `api/voice/dispatch`. Required only after a future change makes `requireVoiceAccess` accept this token. Foundation merge ships without this wired, so cron→dispatch will 401 until the follow-up lands. |
| `HUBSPOT_PRIVATE_APP_TOKEN` | **Added in Sprint 5 Stream A — Voice Surface Parity Catch-up.** HubSpot Private App token consumed by `src/lib/voice/hubspot.ts` for two purposes: (1) `phoneInHubspotFilter` lookups when an agent's `allowlist_mode = 'hubspot'`, and (2) `logSdrOutcome` writing call outcomes back as HubSpot Call activities. Missing token causes both helpers to short-circuit with `{ ok: false, skipped: true }` — voice dispatch keeps working for `allowlist` and `open` modes; only `hubspot` mode rejects with `"HUBSPOT_PRIVATE_APP_TOKEN not set"`. Get the token from HubSpot Settings → Integrations → Private Apps. |

## Client-exposed (Vite-bundled)

| Key | Value / Notes |
|---|---|
| `VITE_VAPI_PUBLIC_KEY` | `2720b3ed-eba0-4843-a6ca-8294c37017e7`. Renamed from `NEXT_PUBLIC_VAPI_PUBLIC_KEY` — Vite needs `VITE_` prefix to surface to the browser bundle. The handler in `api/voice/web-call/config.ts` falls back to the legacy name if set. |
| `VITE_SUPABASE_URL` | Already present. |
| `VITE_SUPABASE_ANON_KEY` | Already present. |
| `VITE_ATRIUM_EMAIL_ALLOWLIST` | Already present. Browser-side allowlist. The server-side allowlist is `metacron.operator_allowlist`. |
| `VITE_ATRIUM_ENABLED` | Already present. Must be `true` for Atrium routes (including the new Voice Agents sub-tab) to render. |

## Foundation merge: PAUSE state

I do not have a Vercel MCP tool that can write env vars. This step requires
Kyle (or Curtis) to land the values above via Vercel's UI:
`https://vercel.com/<team>/unicron-platform/settings/environment-variables`.

The PR can be **opened** before env vars land — typecheck/lint/build are
env-independent. But the **preview deploy's** voice endpoints will 500 until
the env vars are added to the Preview scope, which is what Phase 15
multi-Vercel verification needs.

Recommended sequence:
1. Open PR (this happens now in Phase 14).
2. Add env vars in Vercel for Preview + Production.
3. Re-deploy the preview (or push an empty commit) so the new env reaches the build.
4. Run Phase 15 verification against the refreshed preview.
