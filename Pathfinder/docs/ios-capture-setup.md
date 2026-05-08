# iOS Capture Setup — Atrium Ingest via iPhone Shortcuts

This doc walks a new team member through getting their iPhone set up to push
voice memos and Apple Notes directly into the Atrium nervous system.

## Step 1: Get your API key from Kyle

Kyle generates a per-person `ingest_api_key` from the Supabase dashboard
(nervous_system.team_members table, config jsonb column). He distributes it
via 1Password shared vault or Signal — never email or Slack.

Your key is tied to your team_member record. Every capture you push is
automatically attributed to you; you do not need to include your UUID in the
shortcut body.

## Step 2: Install the Shortcuts app

The Shortcuts app ships with iOS and is available at:
`App Store > Shortcuts` (by Apple)

If you removed it, reinstall from the App Store. No third-party apps required.

## Step 3: Build the Voice Memo shortcut

Follow the spec at:
`Pathfinder/scripts/ios-shortcuts/voice-memo.shortcut.md`

Set the `API_KEY` variable in the shortcut to the key Kyle gave you.

Recommended: add to your Home Screen for one-tap access.
Optional: invoke via Siri — "Hey Siri, Voice Memo to Atrium."

## Step 4: Build the Apple Note shortcut

Follow the spec at:
`Pathfinder/scripts/ios-shortcuts/apple-note.shortcut.md`

Same `API_KEY` variable as the voice memo shortcut.

Recommended: add to the Share Sheet so you can trigger it from inside the Notes app.

## Step 5: Test both shortcuts

Send a test capture and confirm the Atrium Now tab shows the new entry in Inbox.
Expected response body: `{"status":"records","inbox":true,...}` for a short note.

If you see a 401: your key is wrong or expired — contact Kyle.
If you see NO_SIGNAL: your note body is too short (under 5 characters).

## Rotating your key

Contact Kyle. He updates your team_member.config.ingest_api_key in Supabase.
Update the `API_KEY` variable in both shortcuts on your device.

## Shortcut spec files

The `.shortcut.md` files in `Pathfinder/scripts/ios-shortcuts/` are the
human-readable blueprints. The actual `.shortcut` binary files (Apple's
proprietary plist format) are built in the Shortcuts app on device and are
not committed to this repo.
