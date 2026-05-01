// POST /api/outreach/send
// body: {
//   project_id, actor_email, provider, recipient_email,
//   draft_subject?, draft_body, sent_subject?, sent_body,
//   outreach_draft_id?
// }
//
// Stream B Gate B2 — operator clicks "Send" in the composer. Reads the
// active email_integrations row for (actor, provider), sends via the
// provider's API from the rep's account, captures the draft→sent diff
// to outreach_edits.
//
// Auth: relies on the upstream basic-auth gate (middleware.ts) — the
// operator hitting the dashboard is already authenticated. The actor_email
// in the body must be a non-empty string; the route does not verify the
// caller's identity beyond that for v1.

import { NextResponse, type NextRequest } from 'next/server';

import { isEmailProvider } from '@/lib/email/oauth';
import { sendOutreach } from '@/lib/email/outreach-send';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface SendBody {
  project_id?: unknown;
  actor_email?: unknown;
  provider?: unknown;
  recipient_email?: unknown;
  draft_subject?: unknown;
  draft_body?: unknown;
  sent_subject?: unknown;
  sent_body?: unknown;
  outreach_draft_id?: unknown;
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const body = (raw ?? {}) as SendBody;
  if (typeof body.project_id !== 'string' || !body.project_id) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }
  if (typeof body.actor_email !== 'string' || !body.actor_email) {
    return NextResponse.json({ error: 'actor_email required' }, { status: 400 });
  }
  if (!isEmailProvider(body.provider)) {
    return NextResponse.json({ error: 'invalid_provider' }, { status: 400 });
  }
  if (typeof body.recipient_email !== 'string' || !body.recipient_email) {
    return NextResponse.json({ error: 'recipient_email required' }, { status: 400 });
  }
  if (typeof body.draft_body !== 'string') {
    return NextResponse.json({ error: 'draft_body required' }, { status: 400 });
  }
  if (typeof body.sent_body !== 'string' || !body.sent_body) {
    return NextResponse.json({ error: 'sent_body required (cannot be empty)' }, { status: 400 });
  }

  let outreachDraftId: number | null = null;
  if (body.outreach_draft_id != null) {
    const n = Number(body.outreach_draft_id);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: 'outreach_draft_id must be numeric' }, { status: 400 });
    }
    outreachDraftId = n;
  }

  try {
    const result = await sendOutreach({
      projectId: body.project_id,
      outreachDraftId,
      actorEmail: body.actor_email,
      provider: body.provider,
      draftSubject: typeof body.draft_subject === 'string' ? body.draft_subject : null,
      draftBody: body.draft_body,
      sentSubject: typeof body.sent_subject === 'string' ? body.sent_subject : null,
      sentBody: body.sent_body,
      recipientEmail: body.recipient_email,
    });

    if (!result.ok) {
      // Edit row was still recorded with the error — return 200 with
      // ok:false so the UI can surface "send failed" without losing
      // the audit trail.
      return NextResponse.json(
        {
          ok: false,
          error: result.error ?? 'send_failed',
          edit: result.edit,
        },
        { status: result.error === 'no_active_integration' ? 412 : 200 },
      );
    }
    return NextResponse.json({ ok: true, edit: result.edit });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
