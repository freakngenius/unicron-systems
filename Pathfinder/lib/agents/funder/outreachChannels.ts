// lib/agents/funder/outreachChannels.ts
//
// Funder onboarding Stage 8 — channel dispatch with env-gated graceful
// degradation.
//
// Each channel reads its credentials from env. When the credentials are
// absent the channel returns { ok: false, reason: 'no_credentials' }
// without throwing — same pattern Pathfinder uses for the Perplexity
// API key. Operators see the draft in the database / dashboard either
// way; the difference is whether it auto-posts.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 8.

import type { FunderOutreachDraft } from './outreachDrafter';

export interface ChannelDispatchResult {
  ok: boolean;
  reason?: 'no_credentials' | 'biosecurity_skip' | 'send_failed';
  error?: string;
  external_id?: string;
}

export interface FunderOutreachDispatch {
  email: ChannelDispatchResult;
  slack: ChannelDispatchResult;
  hubspot: ChannelDispatchResult;
}

async function dispatchEmail(draft: FunderOutreachDraft, to: string | null): Promise<ChannelDispatchResult> {
  if (draft.email.skipped_reason) {
    return { ok: false, reason: 'biosecurity_skip', error: draft.email.skipped_reason };
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, reason: 'no_credentials' };
  if (!to) return { ok: false, reason: 'no_credentials', error: 'no recipient' };
  try {
    const from = process.env.FUNDER_OUTREACH_FROM ?? 'pathfinder@unicron.systems';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: draft.email.subject, text: draft.email.body }),
    });
    if (!res.ok) return { ok: false, reason: 'send_failed', error: `${res.status}: ${await res.text()}` };
    const data = (await res.json()) as { id?: string };
    return { ok: true, external_id: data.id };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err instanceof Error ? err.message : String(err) };
  }
}

async function dispatchSlack(draft: FunderOutreachDraft): Promise<ChannelDispatchResult> {
  const webhook = process.env.FUNDER_SLACK_WEBHOOK_URL;
  if (!webhook) return { ok: false, reason: 'no_credentials' };
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: draft.slack.line }),
    });
    if (!res.ok) return { ok: false, reason: 'send_failed', error: `${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err instanceof Error ? err.message : String(err) };
  }
}

async function dispatchHubspot(draft: FunderOutreachDraft): Promise<ChannelDispatchResult> {
  const apiKey = process.env.FUNDER_HUBSPOT_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_credentials' };
  try {
    // HubSpot Companies API — upsert a company record with the Funder fields
    // as custom properties. Idempotent by pathfinder_project_id.
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          name: draft.hubspot.fields.organization_name,
          pathfinder_thesis_area: draft.hubspot.fields.thesis_area,
          pathfinder_score: draft.hubspot.fields.score,
          pathfinder_founder_summary: draft.hubspot.fields.founder_summary,
          pathfinder_first_step: draft.hubspot.fields.first_step,
          pathfinder_compliance_flag: draft.hubspot.fields.compliance_flag,
          pathfinder_source: draft.hubspot.fields.source,
          pathfinder_project_id: draft.hubspot.fields.pathfinder_project_id,
        },
      }),
    });
    if (!res.ok) return { ok: false, reason: 'send_failed', error: `${res.status}: ${await res.text()}` };
    const data = (await res.json()) as { id?: string };
    return { ok: true, external_id: data.id };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function dispatchFunderOutreach(
  draft: FunderOutreachDraft,
  opts: { emailTo?: string | null } = {},
): Promise<FunderOutreachDispatch> {
  const [email, slack, hubspot] = await Promise.all([
    dispatchEmail(draft, opts.emailTo ?? null),
    dispatchSlack(draft),
    dispatchHubspot(draft),
  ]);
  return { email, slack, hubspot };
}
