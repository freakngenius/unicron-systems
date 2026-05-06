// app/api/ingest/route.ts — Sprint 0 Foundation (Nervous System)
//
// Shared ingest endpoint for the Unicron Nervous System.
// Sprint 0: stub that validates the payload shape, checks the API key,
// and returns a 200 echo. Real ingest skill (ledger write, vault doc,
// action items, Taboo Keeper validation) is Sprint 1.
//
// Auth: x-unicron-api-key header must match UNICRON_INGEST_API_KEY env var.
// Input: JSON body per SPEC section 7.3 ingest skill contract.
//
// UNICRON_INGEST_API_KEY must be set in Vercel dashboard before deploying.
// Local dev: add to .env.local. Value in .env.example is a placeholder.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const participantSchema = z.object({
  team_member_id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const capturedBySchema = z.object({
  type: z.enum(['human', 'agent']),
  id: z.string().uuid(),
});

const ingestPayloadSchema = z.object({
  source_type: z.enum(['call', 'slack', 'email', 'voice_memo', 'apple_note', 'manual']),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string().min(1),
  participants: z.array(participantSchema),
  captured_at: z.string().datetime(),
  captured_by: capturedBySchema,
});

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-unicron-api-key');
  if (!apiKey || apiKey !== process.env.UNICRON_INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: 'received',
    echo: parsed.data,
    note: 'Ingest skill not yet implemented; Sprint 1',
  });
}
