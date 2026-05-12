// api/inbound/plaud/calls.ts — Stream C5a of the Calls Ingestion sprint.
//
// HALT — Plaud (the consumer voice-recorder device) does not expose a public
// API for individual accounts as of 2026-05-12. Research summary:
//
//   - The Plaud mobile app syncs to plaud.ai cloud storage. There is no
//     documented public REST endpoint for pulling transcripts, no webhook on
//     folder add, and no Zapier integration as of this writing.
//   - Plaud has an enterprise tier ("Plaud Business") that is reportedly API-
//     enabled, but pricing and SLA are quote-only and we are not enrolled.
//   - The most reliable Plaud → Atrium path right now is manual: export the
//     transcript from the Plaud app and paste it into Atrium Work > Calls >
//     `+ Upload call` (C3).
//
// This handler exists as a placeholder so the URL space `/api/inbound/plaud/*`
// is reserved for the day Plaud ships a webhook. The current implementation
// returns 501 Not Implemented with a structured reason that the bug-fix card
// can be tracked against.
//
// Bug Fix card to file:
//   Title:  "Plaud automatic ingestion — depends on Plaud API availability"
//   Body:   Watch Plaud.ai for "Plaud Business" / API announcements. When
//           shipped, wire this handler to verify the webhook signature,
//           extract title/date/participants/transcript from the Plaud payload,
//           and call ingestCallTranscript() (see lib/calls-ingest.ts).
//   Env vars (when API exists):
//     PLAUD_WEBHOOK_SECRET     — HMAC-SHA256 signing key set in Plaud webhook config
//     PLAUD_UNICRON_FOLDER_ID  — Plaud folder ID to filter by (Kyle's "Unicron Systems" folder)

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  res.status(501).json({
    ok: false,
    error: 'Plaud automatic ingestion is not yet wired',
    reason: 'Plaud has no documented public webhook/API for individual accounts as of 2026-05-12',
    workaround: 'Export the transcript from the Plaud app and use Atrium Work > Calls > Upload call (manual upload).',
  });
}
