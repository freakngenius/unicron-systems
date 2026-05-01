// lib/contacts/extractor.ts — Contact Resolver Phase 1 extractor (P0-02c).
//
// Pure functions that parse a verified project's raw_payload and return
// source-side contact rows ready for insertion into
// pathfinder.project_contacts. v1 only handles raw_payload extraction;
// Phase 2 (Apollo / Hunter) and Phase 3 (Sonar) ship in a follow-up PR
// once we have hit-rate data on what Phase 1 alone produces.
//
// Spec (canonical full vision): Pathfinder/agent-specs/11-computer-contact-resolver.md
// Plan (v1 scope cut):           Pathfinder/docs/PLAN-P0-02C-CONTACT-RESOLVER.md
// Schema:                        Pathfinder/supabase/migrations/0013_project_contacts.sql
//
// The dispatcher (extractContacts) returns BOTH a `contacts` list (rows to
// insert) and a `skipped` list (rejected candidates). The cron handler logs
// one extract_skip event per skipped entry. The diagnostic counts inform
// the v2 go/no-go on paid enrichment: high "name without channel" volume
// from USAspending => Hunter on the recipient domain is high-value.

import type { Project, ProjectContact } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

/** Row ready to insert into pathfinder.project_contacts. The schema's id
 *  and surfaced_at default-fill, so we omit them from the insert shape. */
export type ContactInsert = Omit<ProjectContact, 'id' | 'surfaced_at'>;

/** A candidate that was discarded during extraction. Diagnostic-only;
 *  surfaced via agent_log extract_skip events with shape
 *  { project_id, reason, name }. The cycle_close event aggregates counts. */
export interface SkippedContact {
  reason: 'no_name' | 'malformed_email' | 'no_channel';
  name: string | null;
}

export interface ExtractResult {
  contacts: ContactInsert[];
  skipped: SkippedContact[];
}

// ────────────────────────────────────────────────────────────────────────
// Confidence constants — keep alongside the schema so a reviewer can
// audit "where does confidence come from" in one place.
// ────────────────────────────────────────────────────────────────────────

/** SAM.gov POCs are source-of-truth contracting officers. Spec §Phase 1. */
export const SAM_GOV_CONFIDENCE = 90;

/** USAspending recipient_name is the awarded contractor — a company, not
 *  a named person — so confidence is one band lower than SAM.gov POCs. */
export const USASPENDING_CONFIDENCE = 80;

// ────────────────────────────────────────────────────────────────────────
// Validators
// ────────────────────────────────────────────────────────────────────────

/** Minimal email regex: non-whitespace local @ non-whitespace domain .
 *  non-whitespace TLD. Spec calls for "obviously malformed" rejection —
 *  this catches the obvious cases without false-rejecting legitimate
 *  addresses (which RFC-5322-strict regexes are notorious for). */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

interface CandidateInput {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

interface ValidatedCandidate {
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

type ValidationOutcome =
  | { ok: true; candidate: ValidatedCandidate }
  | { ok: false; skip: SkippedContact };

/** Validate a candidate row in spec order: name → email → channel.
 *  Order matters because it determines which skip reason fires when
 *  multiple checks would fail.
 *
 *  - name first: without a name we have nothing to identify the candidate
 *    in a skip event, so we report that first
 *  - email next: only if email is provided and malformed; absent or valid
 *    both pass through
 *  - channel last: must have at least one of email / phone / linkedin_url */
function validate(c: CandidateInput): ValidationOutcome {
  if (!c.full_name) {
    return { ok: false, skip: { reason: 'no_name', name: null } };
  }
  if (c.email !== null && !isValidEmail(c.email)) {
    return { ok: false, skip: { reason: 'malformed_email', name: c.full_name } };
  }
  if (c.email === null && c.phone === null && c.linkedin_url === null) {
    return { ok: false, skip: { reason: 'no_channel', name: c.full_name } };
  }
  return {
    ok: true,
    candidate: {
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      linkedin_url: c.linkedin_url,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// SAM.gov — pointOfContact array
// ────────────────────────────────────────────────────────────────────────

/** Pull every entry of the pointOfContact array. Each entry produces one
 *  candidate with role 'contracting_officer' (per spec). Skips with
 *  diagnostic reason are accumulated into the result for the cron handler
 *  to log per-candidate.
 *
 *  Spec §Phase 1 — SAM.gov: "extract pointOfContact array. Each entry
 *  typically has fullName, email, phone, title. Role for these is always
 *  contracting_officer." */
export function extractFromSamGov(
  payload: Record<string, unknown>,
  projectId: string,
): ExtractResult {
  const pocRaw = payload['pointOfContact'];
  if (!Array.isArray(pocRaw)) return { contacts: [], skipped: [] };

  const contacts: ContactInsert[] = [];
  const skipped: SkippedContact[] = [];

  for (const entry of pocRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const full_name = stringOrNull(e['fullName']) ?? stringOrNull(e['name']);
    const email = stringOrNull(e['email']);
    const phone = stringOrNull(e['phone']);
    const title = stringOrNull(e['title']);

    const v = validate({ full_name, email, phone, linkedin_url: null });
    if (!v.ok) {
      skipped.push(v.skip);
      continue;
    }

    contacts.push({
      project_id: projectId,
      contact_role: 'contracting_officer',
      full_name: v.candidate.full_name,
      email: v.candidate.email,
      phone: v.candidate.phone,
      linkedin_url: null,
      company: null,
      title,
      source: 'raw_payload',
      confidence: SAM_GOV_CONFIDENCE,
      inferred: false,
    });
  }

  return { contacts, skipped };
}

// ────────────────────────────────────────────────────────────────────────
// USAspending — recipient_name + best-effort channel
// ────────────────────────────────────────────────────────────────────────

/** USAspending public records typically do NOT include a contact channel.
 *  Phase 1 extracts the awarded contractor (recipient_name) as a GC-tier
 *  contact and looks for a best-effort channel; if none is present (the
 *  common case), the candidate is skipped with reason='no_channel'. The
 *  skip-log volume is the diagnostic that drives the v2 paid-enrichment
 *  decision (Hunter on the recipient domain).
 *
 *  Note on `title`: the plan considered using the awarding subtier-agency
 *  name as the title, but a contractor-company title field collides
 *  semantically with v2 Apollo/Hunter rows where title is a person's role.
 *  Leaving null keeps the column consistently typed as "person's job
 *  title" across all sources. The agency context is recoverable from
 *  the project row itself, not the contact row. */
export function extractFromUSAspending(
  payload: Record<string, unknown>,
  projectId: string,
): ExtractResult {
  const recipientName = stringOrNull(payload['recipient_name']);
  if (!recipientName) {
    // Nothing to extract; not a "skipped candidate" — there was no candidate.
    return { contacts: [], skipped: [] };
  }

  // Best-effort channel hunt. These keys are rare in practice but cheap
  // to check; the diagnostic value is in confirming USAspending payloads
  // really do omit them.
  const email = stringOrNull(payload['recipient_email']);
  const phone = stringOrNull(payload['recipient_phone']);

  const v = validate({ full_name: recipientName, email, phone, linkedin_url: null });
  if (!v.ok) {
    return { contacts: [], skipped: [v.skip] };
  }

  return {
    contacts: [
      {
        project_id: projectId,
        contact_role: 'gc',
        full_name: v.candidate.full_name,
        email: v.candidate.email,
        phone: v.candidate.phone,
        linkedin_url: null,
        company: recipientName,
        title: null,
        source: 'raw_payload',
        confidence: USASPENDING_CONFIDENCE,
        inferred: false,
      },
    ],
    skipped: [],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────

/** Route a project to the right per-source extractor. Returns
 *  { contacts: [], skipped: [] } for sources we don't yet handle (e.g.,
 *  'news', 'harris') — those slots are reserved for v2+. */
export function extractContacts(
  project: Pick<Project, 'id' | 'source' | 'raw_payload'>,
): ExtractResult {
  if (!project.raw_payload || typeof project.raw_payload !== 'object') {
    return { contacts: [], skipped: [] };
  }

  const sourceKey = String(project.source ?? '').toLowerCase();
  switch (sourceKey) {
    case 'usaspending':
      return extractFromUSAspending(project.raw_payload, project.id);
    case 'sam.gov':
    case 'sam_gov': // alias used by the agent-spec; canonical type is 'sam.gov'
      return extractFromSamGov(project.raw_payload, project.id);
    default:
      return { contacts: [], skipped: [] };
  }
}
