// services/contact-enricher/persist.ts — Demo Polish UX Gate 8B.
//
// Writes the orchestrator's output to pathfinder.lead_contacts. Uses
// service-role supabase admin client because lead_contacts RLS allows
// SELECT by anon/auth but write only by service_role (per migration
// 0112).
//
// Idempotency: caller decides. The default behavior here is "wipe + insert"
// per project — any existing rows for the project_id are deleted before
// the new set is inserted. This matches the spec's enrich-on-cron model
// where each run is the authoritative snapshot. Operators that need
// historical audit can read from a future event-sourced table; the demo
// path doesn't need it.

import type { EnrichedContact } from './providers/types';

export async function writeContacts(
  projectId: string,
  contacts: EnrichedContact[],
): Promise<{ deleted: number; inserted: number }> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (col: string, v: string) => Promise<{
          error: { message: string } | null;
          count: number | null;
        }>;
      };
      insert: (rows: unknown[]) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
  const del = await sb.from('lead_contacts').delete().eq('project_id', projectId);
  if (del.error) {
    throw new Error(`lead_contacts delete failed: ${del.error.message}`);
  }
  const deleted = del.count ?? 0;
  if (contacts.length === 0) {
    return { deleted, inserted: 0 };
  }
  const rows = contacts.map((c) => ({
    project_id: c.project_id,
    owner_organization: c.owner_organization,
    contact_name: c.contact_name,
    role: c.role,
    seniority: c.seniority,
    email: c.email,
    email_status: c.email_status,
    phone: c.phone,
    phone_type: c.phone_type,
    linkedin_url: c.linkedin_url,
    source: c.source,
    source_confidence: c.source_confidence,
    decision_authority: c.decision_authority,
    last_verified_at: c.last_verified_at ?? null,
    notes: c.notes ?? null,
  }));
  const ins = await sb.from('lead_contacts').insert(rows);
  if (ins.error) {
    throw new Error(`lead_contacts insert failed: ${ins.error.message}`);
  }
  return { deleted, inserted: rows.length };
}
