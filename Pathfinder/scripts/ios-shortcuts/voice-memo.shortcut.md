# Shortcut: Voice Memo to Atrium

Captures a dictated voice memo and routes it to the Atrium ingest pipeline as `voice_memo`.

## Variables to set in the shortcut

| Variable | Value |
|---|---|
| `API_KEY` | Your personal ingest_api_key (from Kyle) |
| `INGEST_URL` | `https://atrium.unicron.systems/api/ingest` |

## Steps

1. **Generate UUID** — Use "Generate UUID" action. Save output as `source_id`.

2. **Get current date** — Use "Format Date" action with format `yyyy-MM-dd'T'HH:mm:ssXXXXX` (ISO 8601 with timezone offset). Save as `captured_at`.

3. **Capture audio** — Use "Dictate Text" action (preferred: transcribes immediately) OR "Record Audio" action (audio-only; transcription handled server-side).
   - If using "Dictate Text": save result as `transcript`.
   - If using "Record Audio": save file as `audio_file`; set `transcript` to empty string `""`.

4. **Build JSON body** — Use "Text" action:
   ```json
   {
     "source_type": "voice_memo",
     "source_id": "[source_id variable]",
     "source_url": null,
     "raw_content": "[transcript variable]",
     "participants": [],
     "captured_at": "[captured_at variable]",
     "captured_by": {
       "type": "human",
       "id": "00000000-0000-0000-0000-000000000000"
     }
   }
   ```
   Note: `captured_by.id` is a placeholder UUID — the server overrides it using your API key.

5. **POST to ingest** — Use "Get Contents of URL" action:
   - URL: `https://atrium.unicron.systems/api/ingest`
   - Method: POST
   - Headers:
     - `Content-Type`: `application/json`
     - `x-unicron-api-key`: `[API_KEY variable]`
   - Request Body: JSON — paste the Text from step 4

6. **Show result** — Use "Show Notification" action:
   - Title: `Atrium Capture`
   - Body: `Voice memo sent. Routing to Inbox.`
   - (Optional) Add a "Show Alert" with the API response for debugging during setup.

## Notes

- If you used "Record Audio" instead of "Dictate Text", the `raw_content` field will be empty.
  The ingest skill returns `ABSTAIN` for audio-only submissions until a transcription step is wired.
  For now, use "Dictate Text" to get immediate signal extraction.
- The shortcut can be added to your Home Screen or invoked via Siri ("Hey Siri, Voice Memo to Atrium").
