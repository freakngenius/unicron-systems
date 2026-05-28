// app/api/zedcor/send-digest/route.ts
//
// Sprint Z1A — POST endpoint that renders the Pathfinder Daily Digest
// and ships it via Resend.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { buildDigestData, buildDigestText } from '@/lib/email/build-digest-data';
import { renderDigest } from '@/lib/email/handlebars-setup';
import { ORCHESTRATOR_AGENT_NAME, ZEDCOR_ORG_ID } from '@/lib/orchestrator/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SendDigestBody {
  recipients?: string[];
}

async function loadTemplate(): Promise<string> {
  const p = path.join(process.cwd(), 'lib', 'email', 'zedcor-digest-template.html');
  return await fs.readFile(p, 'utf-8');
}

async function logDigestSent(payload: Record<string, unknown>): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> };
  };
  await admin.from('agent_log').insert({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'digest_sent',
    event_data: payload,
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SendDigestBody = {};
  try {
    body = (await req.json()) as SendDigestBody;
  } catch {
    body = {};
  }
  const recipients = (body.recipients && body.recipients.length > 0)
    ? body.recipients
    : ['team@unicron.systems'];

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });
  }

  try {
    const data = await buildDigestData({ recipients });
    const template = await loadTemplate();
    const html = renderDigest(template, data);
    const text = buildDigestText(data);

    // Render subject through Handlebars too.
    const subjectTemplate = 'Pathfinder Houston — {{new_leads_count}} new opportunities · {{date_pretty_short}}';
    const datePrettyShort = data.date_pretty.replace(/^[^,]+,\s*/, '').replace(/\s*\d{4}$/, '');
    const subject = renderDigest(subjectTemplate, { ...data, date_pretty_short: datePrettyShort });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = process.env.RESEND_FROM_ADDRESS ?? 'Pathfinder <pathfinder@unicron.systems>';
    const sendResult = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject,
      html,
      text,
      tags: [
        { name: 'product', value: 'pathfinder' },
        { name: 'tenant', value: 'zedcor' },
        { name: 'edition', value: data.edition_no },
      ],
    });

    const messageId = (sendResult.data as { id?: string } | null)?.id ?? null;
    await logDigestSent({
      resend_message_id: messageId,
      recipients,
      lead_count: data.leads.length,
      leads_remaining_count: data.leads_remaining_count,
      run_id: Number(data.run_id),
      edition_no: data.edition_no,
    });

    return NextResponse.json({
      resend_message_id: messageId,
      lead_count: data.leads.length,
      recipients,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
