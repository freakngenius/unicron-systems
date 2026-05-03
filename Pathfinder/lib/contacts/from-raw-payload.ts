// lib/contacts/from-raw-payload.ts — Demo Polish UX Gate 8X-1.
//
// Pure extractor: walks a sam.gov raw_payload and produces lead_contacts
// rows from its `pointOfContact` array. Used by both the backfill script
// (scripts/backfill-contacts-from-raw-payload.ts) and (future) the
// real-time ingester so newly-ingested sam.gov rows materialize contacts
// automatically without a backfill pass.
//
// No DB imports. Side-effect-free. Unit-tested against the real shapes
// observed in production:
//   - pointOfContact is always an array of {type, fullName, email, phone, title, fax}
//   - type ∈ {'primary', 'secondary'}
//   - title is null in 100% of observed rows (sam.gov doesn't ship it)
//   - phone may be empty string (50% of POC entries)
//   - email is present in 99% (rare empty/null edge cases)

import type { LeadContactRow } from '@/lib/types';

export interface SamGovPointOfContact {
  type?: 'primary' | 'secondary' | string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  fax?: string | null;
}

export interface SamGovRawPayload {
  pointOfContact?: SamGovPointOfContact[] | unknown;
  fullParentPathName?: string | null;
  officeAddress?: {
    city?: string | null;
    state?: string | null;
    zipcode?: string | null;
    countryCode?: string | null;
  } | null;
  // Plus many other fields not consumed here.
}

const PRIMARY_TITLE_FALLBACK = 'Contracting Officer';
const SECONDARY_TITLE_FALLBACK = 'Contract Specialist';

// Pull the leaf segment off "DEPT OF DEFENSE.DEPT OF THE ARMY...W6QK ACC-RSA"
// — the actual office that owns the procurement is the most specific.
export function ownerOrgFromAgencyPath(path: string | null | undefined): string {
  if (!path) return 'Unknown federal office';
  const segments = path.split('.').map((s) => s.trim()).filter(Boolean);
  return segments[segments.length - 1] ?? 'Unknown federal office';
}

function nonEmptyTrim(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length > 0 ? t : null;
}

function titleForContact(poc: SamGovPointOfContact): string {
  const explicit = nonEmptyTrim(poc.title);
  if (explicit) return explicit;
  const type = (poc.type ?? '').toLowerCase();
  return type === 'secondary' ? SECONDARY_TITLE_FALLBACK : PRIMARY_TITLE_FALLBACK;
}

// Insert payload (no id / enriched_at / last_verified_at — the DB sets the
// first two; the third stays null for raw-payload sources).
export type LeadContactInsert = Omit<
  LeadContactRow,
  'id' | 'enriched_at' | 'last_verified_at'
> & {
  last_verified_at: string | null;
};

export function contactsFromSamGovPayload(
  projectId: string,
  payload: SamGovRawPayload,
): LeadContactInsert[] {
  const poc = payload.pointOfContact;
  if (!Array.isArray(poc)) return [];
  const ownerOrganization = ownerOrgFromAgencyPath(payload.fullParentPathName);
  const out: LeadContactInsert[] = [];
  for (const entry of poc as SamGovPointOfContact[]) {
    if (!entry || typeof entry !== 'object') continue;
    const name = nonEmptyTrim(entry.fullName);
    if (!name) continue; // Spec: contact_name is NOT NULL.
    const email = nonEmptyTrim(entry.email);
    const phone = nonEmptyTrim(entry.phone);
    const role = titleForContact(entry);
    const isSecondary = (entry.type ?? '').toLowerCase() === 'secondary';
    out.push({
      project_id: projectId,
      owner_organization: ownerOrganization,
      contact_name: name,
      role,
      // Contracting officers + specialists sit at the manager seniority
      // tier in this taxonomy. They are not VP+ but they ARE the people
      // who answer the procurement phone number on the solicitation.
      seniority: 'manager',
      email,
      // sam.gov is the authoritative federal source — emails published in
      // the solicitation are the official channel. Mark verified.
      email_status: email ? 'verified' : null,
      phone,
      phone_type: phone ? 'direct' : null,
      linkedin_url: null,
      source: 'sam.gov-pointOfContact' as LeadContactRow['source'],
      // Authoritative source = full confidence.
      source_confidence: 1.0,
      // Per spec § Decision authority: procurement / contracting officers
      // are gatekeepers (not the buyer with budget — the gateway to them).
      decision_authority: 'gatekeeper',
      last_verified_at: null,
      notes: `Contracting Officer (${isSecondary ? 'secondary' : 'primary'}) — sam.gov pointOfContact`,
    });
  }
  return out;
}
