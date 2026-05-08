# Shortcut: Apple Note to Atrium

Sends the body (and optionally the title) of a selected Apple Note to the Atrium ingest pipeline as `apple_note`.

## Variables to set in the shortcut

| Variable | Value |
|---|---|
| `API_KEY` | Your personal ingest_api_key (from Kyle) |
| `INGEST_URL` | `https://atrium.unicron.systems/api/ingest` |

## Steps

1. **Get current note** — Use "Find Notes" action with filter "Limit 1" and sort "Last Modified — Latest First". This picks the note you were just editing. Alternatively, use "Show Note Picker" to let you select manually.

2. **Get note body** — Use "Get Details of Notes" action, selecting "Body" from the note found in step 1. Save as `note_body`.

3. **Get note title** — Use "Get Details of Notes" action, selecting "Name" from the same note. Save as `note_title`.

4. **Generate UUID** — Use "Generate UUID" action. Save as `source_id`.

5. **Get current date** — Use "Format Date" action with format `yyyy-MM-dd'T'HH:mm:ssXXXXX`. Save as `captured_at`.

6. **Build JSON body** — Use "Text" action:
   ```json
   {
     "source_type": "apple_note",
     "source_id": "[source_id variable]",
     "source_url": null,
     "raw_content": "[note_body variable]",
     "participants": [],
     "captured_at": "[captured_at variable]",
     "captured_by": {
       "type": "human",
       "id": "00000000-0000-0000-0000-000000000000"
     },
     "metadata": {
       "channel": "apple_notes",
       "note_title": "[note_title variable]"
     }
   }
   ```
   Note: `captured_by.id` is a placeholder UUID — the server overrides it using your API key.

7. **POST to ingest** — Use "Get Contents of URL" action:
   - URL: `https://atrium.unicron.systems/api/ingest`
   - Method: POST
   - Headers:
     - `Content-Type`: `application/json`
     - `x-unicron-api-key`: `[API_KEY variable]`
   - Request Body: JSON — paste the Text from step 6

8. **Show result** — Use "Show Notification" action:
   - Title: `Atrium Capture`
   - Body: `Note sent. Routing to Inbox.`
   - (Optional) Add "Show Alert" with API response body for debugging during setup.

## Notes

- Notes with fewer than 5 characters in the body are rejected by the server (NO_SIGNAL).
- Partial or uncertain notes are automatically routed to Inbox (low confidence) — they still get stored, just flagged for review.
- This shortcut can be added to the Share Sheet so you can trigger it from directly inside the Notes app via the share icon.
- To add to Share Sheet: in Shortcut settings, enable "Show in Share Sheet" and set input type to "Text" or "Any".
