// app/api/leads/[projectId]/outreach/send/route.ts — Demo Polish UX
// Gate 9D. Connection-routed send endpoint per SPEC - Lead Detail Page
// v2.md § 7.
//
// Reads the user's resolved connection (user_connections or fallback to
// email_integrations), dispatches via the existing sendOutreach
// orchestrator (which writes outreach_edits for the legacy diff loop),
// then writes a parallel pathfinder.outreach_sends row keyed by the
// connection's user_id. On failure, the outreach_sends row is still
// written with status='failed' + error_message so the v2 Sent History
// surface can render failure context.

import { NextResponse, type NextRequest } from 'next/server';

import { sendOutreach } from '@/lib/email/outreach-send';
import { resolveActiveConnection } from '@/lib/outreach/user-connection';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface SendRequestBody {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  /** Optional contact pin from the Composer's "Use as recipient" hook. */
  contact_id?: unknown;
  /** Optional. The actor email (operator identity); falls back to env
   *  default for the demo. Real Auth replaces this in Gate 9.5. */
  actor_email?: unknown;
}

const DEMO_OPERATOR_EMAIL =
  process.env.PF_DEMO_OPERATOR_EMAIL ?? 'kyle@freakngenius.com';

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = decodeURIComponent(params.projectId);

  let body: SendRequestBody = {};
  try {
    const json = (await req.json()) as SendRequestBody;
    if (json && typeof json === 'object') body = json;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const bodyText = typeof body.body === 'string' ? body.body : '';
  const contactId =
    typeof body.contact_id === 'string' && body.contact_id.length > 0
      ? body.contact_id
      : null;
  const actorEmail =
    typeof body.actor_email === 'string' && body.actor_email.length > 0
      ? body.actor_email
      : DEMO_OPERATOR_EMAIL;

  if (!to) {
    return NextResponse.json({ error: 'recipient_required' }, { status: 400 });
  }
  if (!bodyText.trim()) {
    return NextResponse.json({ error: 'body_required' }, { status: 400 });
  }

  const conn = await resolveActiveConnection(actorEmail);
  if (!conn) {
    return NextResponse.json(
      { error: 'no_connection', code: 'no_connection' },
      { status: 412 },
    );
  }

  // Run the existing send pipeline so outreach_edits + email_threads
  // continue to capture the diff + thread state for reply detection.
  const result = await sendOutreach({
    projectId,
    actorEmail,
    provider: conn.provider,
    recipientEmail: to,
    draftSubject: subject,
    draftBody: bodyText,
    sentSubject: subject,
    sentBody: bodyText,
  });

  // Write the parallel pathfinder.outreach_sends row for the v2 surface.
  const admin = supabaseAdmin();
  const sendRow = {
    project_id: projectId,
    user_id: conn.user_id,
    contact_id: contactId,
    to_email: to,
    subject,
    body: bodyText,
    provider: conn.provider,
    message_id: result.ok ? result.edit.provider_message_id ?? null : null,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.error ?? 'send_failed',
  };
  // Best-effort. A persistence failure here shouldn't unwind a successful
  // provider send (which is already recorded to outreach_edits via
  // sendOutreach above).
  try {
    await (
      admin.from('outreach_sends') as unknown as {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }
    ).insert(sendRow);
  } catch {
    // swallow
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'send_failed', code: 'send_failed' },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    message_id: result.edit.provider_message_id ?? null,
    provider: conn.provider,
  });
}
