// lib/inngest/functions/ingest-router.ts — Sprint 0 Foundation (Nervous System)
//
// Subscribes: unicron/ingest.received
// Sprint 0: placeholder — logs the event payload and exits.
// Sprint 1 will implement the real ingest skill (ingest-base, vault write,
// ledger row, action item creation, Taboo Keeper validation).

import { inngest } from '../client';

interface IngestReceivedEvent {
  data: {
    source_type: string;
    source_id: string;
    source_url: string | null;
    raw_content: string;
    participants: { team_member_id?: string; name?: string; email?: string }[];
    captured_at: string;
    captured_by: { type: 'human' | 'agent'; id: string };
  };
}

export const ingestRouter = inngest.createFunction(
  {
    id: 'unicron-ingest-router',
    name: 'Unicron Ingest Router (Sprint 0 placeholder)',
    retries: 0,
    triggers: [{ event: 'unicron/ingest.received' }],
  },
  async ({ event }: { event: IngestReceivedEvent }) => {
    console.log('[ingest-router] event received — Sprint 1 will process this', {
      source_type: event.data.source_type,
      source_id: event.data.source_id,
      captured_at: event.data.captured_at,
      captured_by: event.data.captured_by,
    });
    return { status: 'placeholder', note: 'Sprint 1 implements the real ingest skill' };
  }
);
