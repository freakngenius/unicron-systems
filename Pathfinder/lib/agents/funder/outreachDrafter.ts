// lib/agents/funder/outreachDrafter.ts
//
// Funder onboarding Stage 8 — Outreach Drafter for the Funder channels.
//
// Produces three artifacts per verified opportunity:
//   - cold email body (Sonnet, in Funder's voice from architecture.outreach)
//   - one-line Slack alert (deterministic, template-based)
//   - pre-filled HubSpot record fields (deterministic mapping)
//
// Biosecurity-flagged opportunities (compliance_flag === 'biosecurity-review')
// skip the email draft per Build-Spec §2 resolved default 2. The Slack one-liner
// and HubSpot fields still emit so the deal team can see the candidate.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 8.

import Anthropic from '@anthropic-ai/sdk';
import type { Project } from '@/lib/types';
import type { OrgArchitecture } from '@/lib/types/architecture';

const SONNET_MODEL = 'claude-sonnet-4-5';
const EMAIL_MAX_TOKENS = 600;
const BACKOFF_MS = [5_000, 15_000];

export interface FunderOutreachDraft {
  project_id: string;
  email: { subject: string; body: string; skipped_reason: string | null };
  slack: { line: string };
  hubspot: {
    fields: {
      organization_name: string;
      thesis_area: string | null;
      score: number | null;
      founder_summary: string | null;
      first_step: string | null;
      compliance_flag: string | null;
      source: string;
      pathfinder_project_id: string;
    };
  };
  /** Telemetry. */
  email_latency_ms: number;
  email_reason?: 'biosecurity_skip' | 'no_api_key' | 'rate_limited' | 'parse_failed' | 'sonnet_error';
}

function getPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function fallbackEmailBody(project: Project, architecture: OrgArchitecture): { subject: string; body: string } {
  const display = architecture.branding.display_name || 'Funder';
  const persona = architecture.outreach.persona;
  return {
    subject: `${display} — quick note about ${project.title}`,
    body: `Hi there,

I'm reaching out from ${display} (${persona}). Your work on ${project.title} fits our active thesis. Brief: ${project.rationale ?? '[rationale unavailable]'}.

If a 20-minute conversation makes sense, I'd value learning more.

Best,
${display} team`,
  };
}

async function draftEmailViaSonnet(
  project: Project,
  architecture: OrgArchitecture,
): Promise<{ subject: string; body: string; latency_ms: number; reason?: FunderOutreachDraft['email_reason'] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...fallbackEmailBody(project, architecture), latency_ms: 0, reason: 'no_api_key' };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = `You are drafting a cold-outreach email on behalf of ${architecture.branding.display_name || 'Funder'}.

Persona: ${architecture.outreach.persona}.
Tone: ${architecture.outreach.tone}.
Value prop: ${architecture.outreach.value_prop}.

You receive ONE verified opportunity. Produce a short cold email (under 120 words) in this exact format:

SUBJECT: <8-12 word subject>
BODY: <plain text, no signature line beyond "Best, <display_name> team">

Rules:
- Reference the specific rationale + first_step provided.
- No em-dashes, no marketing copy, no "I hope this email finds you well."
- One concrete ask in the closing sentence.
- No code fence, no prose outside SUBJECT: / BODY:.`;

  const payload = getPayload(project);
  const user = JSON.stringify({
    opportunity: {
      org_name: project.title,
      summary: project.summary,
      rationale: project.rationale,
      first_step: project.outreach_hook,
      thesis_area: payload.funder_inferred_thesis ?? null,
      founder_summary: payload.founder_affiliation ?? null,
      score: project.score,
    },
  });

  for (let attempt = 0; attempt < BACKOFF_MS.length + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: SONNET_MODEL,
        max_tokens: EMAIL_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const latency_ms = Date.now() - t0;
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      // Parse SUBJECT: ... BODY: ...
      const sIdx = text.search(/subject\s*:/i);
      const bIdx = text.search(/body\s*:/i);
      if (sIdx < 0 || bIdx < 0 || bIdx <= sIdx) {
        return { ...fallbackEmailBody(project, architecture), latency_ms, reason: 'parse_failed' };
      }
      const subject = text.slice(sIdx, bIdx).replace(/^\s*subject\s*:\s*/i, '').trim();
      const body = text.slice(bIdx).replace(/^\s*body\s*:\s*/i, '').trim();
      return { subject, body, latency_ms };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      if (status === 429) {
        return { ...fallbackEmailBody(project, architecture), latency_ms: Date.now() - t0, reason: 'rate_limited' };
      }
      return { ...fallbackEmailBody(project, architecture), latency_ms: Date.now() - t0, reason: 'sonnet_error' };
    }
  }
  return { ...fallbackEmailBody(project, architecture), latency_ms: 0, reason: 'rate_limited' };
}

function buildSlackLine(project: Project): string {
  const payload = getPayload(project);
  const thesis = (payload.funder_inferred_thesis as string | null) ?? 'unclassified';
  const hub = (payload.funder_geo_hub as string | null) ?? '?';
  const founder = (payload.founder_affiliation as string | null) ?? '';
  const flag = payload.funder_compliance_flag ? ` ⚠️${payload.funder_compliance_flag}` : '';
  const scoreStr = project.score != null ? `${project.score}/100` : 'unscored';
  const founderStr = founder ? ` — ${founder}` : '';
  return `:funder: *${project.title}* (${scoreStr}, ${thesis}, ${hub})${founderStr}${flag}`;
}

function buildHubspotFields(project: Project): FunderOutreachDraft['hubspot']['fields'] {
  const payload = getPayload(project);
  return {
    organization_name: project.title,
    thesis_area: (payload.funder_inferred_thesis as string | null) ?? null,
    score: project.score,
    founder_summary: (payload.founder_affiliation as string | null) ?? null,
    first_step: project.outreach_hook,
    compliance_flag: (payload.funder_compliance_flag as string | null) ?? null,
    source: project.source,
    pathfinder_project_id: project.id,
  };
}

export async function draftFunderOutreach(
  project: Project,
  architecture: OrgArchitecture,
): Promise<FunderOutreachDraft> {
  const payload = getPayload(project);
  const biosecuritySkip = payload.funder_compliance_flag === 'biosecurity-review';

  const slack = { line: buildSlackLine(project) };
  const hubspot = { fields: buildHubspotFields(project) };

  if (biosecuritySkip) {
    return {
      project_id: project.id,
      email: { subject: '', body: '', skipped_reason: 'biosecurity-review compliance flag (Build-Spec §2 default 2)' },
      slack,
      hubspot,
      email_latency_ms: 0,
      email_reason: 'biosecurity_skip',
    };
  }

  const emailRes = await draftEmailViaSonnet(project, architecture);
  return {
    project_id: project.id,
    email: { subject: emailRes.subject, body: emailRes.body, skipped_reason: null },
    slack,
    hubspot,
    email_latency_ms: emailRes.latency_ms,
    email_reason: emailRes.reason,
  };
}

// Exported for tests.
export { buildSlackLine, buildHubspotFields, fallbackEmailBody };
