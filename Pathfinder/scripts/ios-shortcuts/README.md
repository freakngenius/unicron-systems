# iOS Shortcuts — Atrium Capture Integration

Two shortcuts let Kyle, Keenan, and Curtis push captures directly to the Atrium
ingest pipeline from their iPhones. One shortcut records a voice memo; the other
sends the current Apple Note.

## Prerequisites

- iOS 16+ with the Shortcuts app installed
- An individual `ingest_api_key` obtained from Kyle (distributed via secure channel)
- Network access to `atrium.unicron.systems` at the time of capture

## API keys

Each team member has their own key stored in `nervous_system.team_members.config.ingest_api_key`.
The route uses that key to automatically set `captured_by` — no UUID in the request body required.

Keys are rotated via Supabase dashboard (update the `config` jsonb for the relevant team_member row).
Kyle distributes new keys via 1Password shared vault or Signal.

Do not commit keys to this repo. Do not share keys across team members.

## Endpoint

```
POST https://atrium.unicron.systems/api/ingest
```

All requests require:
```
x-unicron-api-key: <your-personal-key>
Content-Type: application/json
```

## Shortcut specs

See the `.shortcut.md` files in this directory for step-by-step Shortcuts app configurations:

- `voice-memo.shortcut.md` — Record audio, dictate, or paste a voice transcript
- `apple-note.shortcut.md` — Send the body of the current Apple Note

Build these in the iOS Shortcuts app using those specs as your blueprint.
`.shortcut` binary files are Apple-proprietary format and are not committed here.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 Unauthorized | Key wrong or expired | Get updated key from Kyle |
| 400 Validation failed | Body malformed | Check `source_id` is a UUID, `captured_at` is ISO 8601 |
| 500 Ingest skill failed | Backend error | Check Vercel function logs |
| Notification not shown | Shortcuts notification permission denied | Settings > Shortcuts > Notifications |
