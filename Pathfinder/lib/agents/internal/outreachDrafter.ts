// lib/agents/internal/outreachDrafter.ts
//
// Internal onboarding Stage 9 — Outreach Drafter for the Internal channels.
//
// Produces three artifacts per verified company:
//   - cold email (Sonnet, in Internal's voice from architecture.outreach)
//   - LinkedIn message (Sonnet, under 300 chars)
//   - internal HubSpot note (deterministic, summarizes the rationale +
//     warm-intro evidence)
//
// Zedcor's lib/outreach.ts (the Zedcor-shaped 3-channel drafter) and
// Funder's lib/agents/funder/outreachDrafter.ts are untouched. Per-org
// dispatch lands at the call site (a cron handler or the outreach
// Inngest function).
//
// Persona / tone / value_prop come from architecture.outreach. No
// em-dashes anywhere in the output.
//
// Spec: Pathfinder/Pathfinder-Internal-Architecture.json outreach.

import Anthropic from '@anthropic-ai/sdk';
import type { Project } from '@/lib/types';
import type { OrgArchitecture } from '@/lib/types/architecture';

const SONNET_MODEL = 'claude-sonnet-4-5';
const EMAIL_MAX_TOKENS = 600;
const LINKEDIN_MAX_TOKENS = 300;
const BACKOFF_MS = [5_000, 15_000];

export type InternalDraftReason =
  | 'no_api_key'
  | 'rate_limited'
  | 'parse_failed'
  | 'sonnet_error';

export interface InternalOutreachDraft {
  project_id: string;
  email: { subject: string; body: string };
  linkedin: { message: string };
  hubspot: {
    note: string;
    fields: {
      company_name: string;
      service_category: string | null;
      hq_state: string | null;
      operating_states: string[];
      score: number | null;
      sales_motion: string | null;
      first_step: string | null;
      website: string | null;
      linkedin_url: string | null;
      pathfinder_project_id: string;
    };
  };
  email_latency_ms: number;
  linkedin_latency_ms: number;
  email_reason?: InternalDraftReason;
  linkedin_reason?: InternalDraftReason;
}

function getPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function getEnrichment(project: Project): Record<string, unknown> {
  const p = getPayload(project);
  return ((p.internal_enrichment as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function getGeo(project: Project): Record<string, unknown> {
  const p = getPayload(project);
  return ((p.internal_geo as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function stripEmDashes(s: string): string {
  return s.replace(/—/g, ' ').replace(/–/g, ' ').replace(/\s+/g, ' ').trim();
}

function fallbackEmail(project: Project, architecture: OrgArchitecture): { subject: string; body: string } {
  const display = architecture.branding.display_name || 'Unicron';
  return {
    subject: `${project.title} morning intro from ${display}`,
    body: `Hi there,\n\nI lead new business at ${display}. Quick note about ${project.title}: ${project.rationale ?? 'your team is on our daily pipeline list.'} ${project.outreach_hook ?? ''}\n\nWorth a 20 minute call this week?\n\nBest,\n${display} team`,
  };
}

function fallbackLinkedin(project: Project, architecture: OrgArchitecture): string {
  const display = architecture.branding.display_name || 'Unicron';
  return `Hi, ${display} here. Saw your work at ${project.title}. Open to a quick 20 minute call this week?`;
}

async function draftEmailViaSonnet(
  project: Project,
  architecture: OrgArchitecture,
): Promise<{ subject: string; body: string; latency_ms: number; reason?: InternalDraftReason }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...fallbackEmail(project, architecture), latency_ms: 0, reason: 'no_api_key' };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = architecture.branding.display_name || 'Unicron';
  const persona = architecture.outreach.persona;
  const tone = architecture.outreach.tone;
  const valueProp = architecture.outreach.value_prop;

  const system = `You are drafting a cold-outreach email on behalf of ${display}.

Persona: ${persona}.
Tone: ${tone}.
Value prop: ${valueProp}.

You receive ONE verified candidate company. Produce a short cold email (under 120 words) in this exact format:

SUBJECT: <8-12 word subject>
BODY: <plain text, no signature line beyond "Best, ${display} team">

Rules:
- Name the prospect's own prospecting pain in one specific sentence.
- Reference the rationale and first_step provided when available.
- No em-dashes. No "I hope this email finds you well." No marketing copy.
- One concrete ask in the closing sentence.
- No code fence, no prose outside SUBJECT: / BODY:.`;

  const enr = getEnrichment(project);
  const geo = getGeo(project);
  const payload = getPayload(project);
  const user = JSON.stringify({
    company: {
      name: project.title,
      service_category:
        (enr.service_category as string | undefined) ??
        (payload.internal_inferred_service_category as string | undefined) ??
        null,
      hq_state: geo.hq_state ?? null,
      operating_states: geo.operating_states ?? [],
      sales_motion: enr.sales_motion ?? null,
      website: enr.website ?? null,
      rationale: project.rationale,
      first_step: project.outreach_hook,
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
      const sIdx = text.search(/subject\s*:/i);
      const bIdx = text.search(/body\s*:/i);
      if (sIdx < 0 || bIdx < 0 || bIdx <= sIdx) {
        return { ...fallbackEmail(project, architecture), latency_ms, reason: 'parse_failed' };
      }
      const subject = stripEmDashes(text.slice(sIdx, bIdx).replace(/^\s*subject\s*:\s*/i, '').trim());
      const body = stripEmDashes(text.slice(bIdx).replace(/^\s*body\s*:\s*/i, '').trim());
      return { subject, body, latency_ms };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      if (status === 429) {
        return { ...fallbackEmail(project, architecture), latency_ms: Date.now() - t0, reason: 'rate_limited' };
      }
      return { ...fallbackEmail(project, architecture), latency_ms: Date.now() - t0, reason: 'sonnet_error' };
    }
  }
  return { ...fallbackEmail(project, architecture), latency_ms: 0, reason: 'rate_limited' };
}

async function draftLinkedinViaSonnet(
  project: Project,
  architecture: OrgArchitecture,
): Promise<{ message: string; latency_ms: number; reason?: InternalDraftReason }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { message: fallbackLinkedin(project, architecture), latency_ms: 0, reason: 'no_api_key' };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = architecture.branding.display_name || 'Unicron';
  const tone = architecture.outreach.tone;

  const system = `You are drafting a LinkedIn first-message on behalf of ${display}.

Tone: ${tone}.

Produce ONE LinkedIn message, plain text, under 280 characters total. No subject line. No em-dashes. No marketing copy. One concrete ask.

Output the message directly with no prefix and no code fence.`;

  const enr = getEnrichment(project);
  const user = JSON.stringify({
    company: {
      name: project.title,
      service_category: enr.service_category ?? null,
      rationale: project.rationale,
      first_step: project.outreach_hook,
    },
  });

  for (let attempt = 0; attempt < BACKOFF_MS.length + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: SONNET_MODEL,
        max_tokens: LINKEDIN_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const latency_ms = Date.now() - t0;
      const text = stripEmDashes(
        res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim(),
      );
      if (!text) {
        return { message: fallbackLinkedin(project, architecture), latency_ms, reason: 'parse_failed' };
      }
      return { message: text.slice(0, 280), latency_ms };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      if (status === 429) {
        return { message: fallbackLinkedin(project, architecture), latency_ms: Date.now() - t0, reason: 'rate_limited' };
      }
      return { message: fallbackLinkedin(project, architecture), latency_ms: Date.now() - t0, reason: 'sonnet_error' };
    }
  }
  return { message: fallbackLinkedin(project, architecture), latency_ms: 0, reason: 'rate_limited' };
}

function buildHubspotNote(project: Project): string {
  const enr = getEnrichment(project);
  const geo = getGeo(project);
  const payload = getPayload(project);
  const adjacency = (payload.internal_adjacency as Record<string, unknown> | undefined) ?? {};
  const overlap = (adjacency.customer_overlap as Array<{ customer_name: string }> | undefined) ?? [];
  const crm = (adjacency.crm_contact_match as Array<{ name: string }> | undefined) ?? [];

  const lines = [
    `Pathfinder verified ${project.title} at ${project.score ?? 'n/a'}/100.`,
    `Service category: ${enr.service_category ?? payload.internal_inferred_service_category ?? 'unknown'}.`,
    `HQ ${geo.hq_state ?? 'unknown'}; operates in ${(geo.operating_states as string[] | undefined)?.join(', ') ?? 'unknown'}.`,
    `Sales motion: ${enr.sales_motion ?? 'unknown'}.`,
  ];
  if (overlap.length > 0) {
    lines.push(`Customer overlap: ${overlap.map((o) => o.customer_name).join(', ')}.`);
  }
  if (crm.length > 0) {
    lines.push(`Warm CRM contact: ${crm.map((c) => c.name).join(', ')}.`);
  }
  if (project.rationale) lines.push(`Rationale: ${project.rationale}`);
  if (project.outreach_hook) lines.push(`First step: ${project.outreach_hook}`);
  return stripEmDashes(lines.join(' '));
}

function buildHubspotFields(project: Project): InternalOutreachDraft['hubspot']['fields'] {
  const enr = getEnrichment(project);
  const geo = getGeo(project);
  const payload = getPayload(project);
  return {
    company_name: project.title,
    service_category:
      (enr.service_category as string | null | undefined) ??
      (payload.internal_inferred_service_category as string | null | undefined) ??
      null,
    hq_state: (geo.hq_state as string | null | undefined) ?? null,
    operating_states: (geo.operating_states as string[] | undefined) ?? [],
    score: project.score,
    sales_motion: (enr.sales_motion as string | null | undefined) ?? null,
    first_step: project.outreach_hook,
    website: (enr.website as string | null | undefined) ?? null,
    linkedin_url: (enr.linkedin as string | null | undefined) ?? null,
    pathfinder_project_id: project.id,
  };
}

export async function draftInternalOutreach(
  project: Project,
  architecture: OrgArchitecture,
): Promise<InternalOutreachDraft> {
  const [emailRes, linkedinRes] = await Promise.all([
    draftEmailViaSonnet(project, architecture),
    draftLinkedinViaSonnet(project, architecture),
  ]);
  return {
    project_id: project.id,
    email: { subject: emailRes.subject, body: emailRes.body },
    linkedin: { message: linkedinRes.message },
    hubspot: { note: buildHubspotNote(project), fields: buildHubspotFields(project) },
    email_latency_ms: emailRes.latency_ms,
    linkedin_latency_ms: linkedinRes.latency_ms,
    email_reason: emailRes.reason,
    linkedin_reason: linkedinRes.reason,
  };
}

// Exported for tests.
export {
  buildHubspotNote,
  buildHubspotFields,
  fallbackEmail,
  fallbackLinkedin,
  stripEmDashes,
};
