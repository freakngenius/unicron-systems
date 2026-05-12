/**
 * Procurement-pull post-call ingest.
 *
 * When a procurement_pull call ends, Vapi extracts structured_data
 * matching the schema in the assistant's analysisPlan.structuredDataPlan.
 * Each entry in structured_data.projects[] becomes a row in
 * pathfinder.projects with source='voice_agent'. Each project_contacts[]
 * entry becomes a row in pathfinder.project_contacts.
 */

// Translated for Atrium: prototype's `import { supabaseAdmin as supabase } from "./supabase"`
// becomes a lazy proxy over the shared service-role client. Lazy avoids
// throwing at module-load time if env is missing (and keeps the module
// safely importable from any context that doesn't actually call into it).
import { getServiceClient } from "../../../api/_lib/supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) _client = getServiceClient();
    return Reflect.get(_client, prop, _client);
  },
});

export type ProjectContact = {
  full_name?: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  phone_type?: "switchboard" | "direct" | "mobile";
  role_tag?: "manager" | "director" | "gatekeeper" | "signer" | "influencer" | "end_user";
  confidence?: number;
};

export type ExtractedProject = {
  project_name?: string;
  project_id_external?: string;
  project_value_usd?: number;
  project_value_text?: string;
  project_stage?: string;
  posted_date?: string;
  rfp_close_date?: string;
  owner_name?: string;
  owner_type?: string;
  prime_contractor_name?: string;
  naics_code?: string;
  naics_description?: string;
  industry_or_category?: string;
  location_text?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  permit_number?: string;
  permit_type?: string;
  permit_filing_date?: string;
  permit_jurisdiction?: string;
  lot_size_acres?: number;
  estimated_towers_count?: string;
  project_contacts?: ProjectContact[];
};

export type ExtractedPayload = {
  office_confirmed?: boolean;
  projects?: ExtractedProject[];
  portal_url_referenced?: string;
  callback_recommended_at?: string;
  contact_friction_score?: number;
  agent_call_outcome?: string;
  notes_for_human?: string;
};

function toIsoDate(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildProjectId(vapiCallId: string, idx: number): string {
  return `voice_${vapiCallId}_${idx}`;
}

// project_contacts.contact_role check constraint:
//   owner | gc | site_super | contracting_officer | decision_maker | other
function mapRoleTag(roleTag: string | undefined): string {
  switch (roleTag) {
    case "manager":
    case "director":
      return "contracting_officer";
    case "signer":
      return "decision_maker";
    case "gatekeeper":
    case "influencer":
    case "end_user":
      return "other";
    default:
      return "other";
  }
}

/**
 * Ingest one call's structured_data into pathfinder.projects + project_contacts.
 * Returns the list of project ids that were created.
 */
export async function ingestProcurementPull(args: {
  vapiCallId: string;
  voiceCallTranscriptId: string;
  customerOrgId: string;
  configId: string | null;
  targetOfficeKey: string | null;
  callSummary: string | null;
  fullTranscript: any[] | null;
  structuredData: ExtractedPayload | null;
}): Promise<{ project_ids: string[]; error?: string; insert_errors?: string[] }> {
  const {
    vapiCallId,
    voiceCallTranscriptId,
    customerOrgId,
    configId,
    targetOfficeKey,
    callSummary,
    fullTranscript,
    structuredData
  } = args;

  if (!structuredData || !Array.isArray(structuredData.projects)) {
    return { project_ids: [], error: "no projects in structured_data" };
  }

  const ids: string[] = [];
  const insertErrors: string[] = [];

  for (let i = 0; i < structuredData.projects.length; i++) {
    const p = structuredData.projects[i];
    if (!p || !p.project_name) continue;

    const projectId = buildProjectId(vapiCallId, i);

    // Compose location text if not provided
    const location_text =
      p.location_text ||
      [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") ||
      null;

    const rawPayload = {
      voice_call_transcript_id: voiceCallTranscriptId,
      vapi_call_id: vapiCallId,
      customer_org_id: customerOrgId,
      config_id: configId,
      target_office_key: targetOfficeKey,
      agent_call_outcome: structuredData.agent_call_outcome ?? null,
      portal_url_referenced: structuredData.portal_url_referenced ?? null,
      callback_recommended_at: structuredData.callback_recommended_at ?? null,
      contact_friction_score: structuredData.contact_friction_score ?? null,
      office_confirmed: structuredData.office_confirmed ?? null,
      notes_for_human: structuredData.notes_for_human ?? null,
      call_summary: callSummary ?? null,
      transcript_excerpt: Array.isArray(fullTranscript)
        ? fullTranscript.slice(0, 50)
        : null,
      extracted_project: p
    };

    const insertProject: any = {
      id: projectId,
      source: "voice_agent",
      // (source, source_id) is unique, so make source_id project-specific
      source_id: `${vapiCallId}_${i}`,
      warm_for_customer_id: customerOrgId,
      country: "US",
      title: p.project_name,
      summary: p.industry_or_category ?? p.naics_description ?? null,
      lat: typeof p.lat === "number" ? p.lat : null,
      lon: typeof p.lon === "number" ? p.lon : null,
      project_value:
        typeof p.project_value_usd === "number"
          ? p.project_value_usd
          : null,
      project_stage: p.project_stage ?? null,
      posted_date: toIsoDate(p.posted_date),
      raw_payload: rawPayload,
      owner_name: p.owner_name ?? null,
      owner_type: p.owner_type ?? null,
      prime_contractor_name: p.prime_contractor_name ?? null,
      naics_code: p.naics_code ?? null,
      naics_description: p.naics_description ?? null,
      location_text,
      estimated_end_date: toIsoDate(p.rfp_close_date),
      permit_number: p.permit_number ?? null,
      permit_type: p.permit_type ?? null,
      permit_filing_date: toIsoDate(p.permit_filing_date),
      permit_jurisdiction: p.permit_jurisdiction ?? null,
      lot_size_acres:
        typeof p.lot_size_acres === "number" ? p.lot_size_acres : null,
      estimated_towers_count: p.estimated_towers_count ?? null,
      ingested_at: new Date().toISOString()
    };

    const { error: insertErr } = await supabase
      .from("projects")
      .upsert(insertProject, { onConflict: "id" });

    if (insertErr) {
      const msg = `project ${projectId}: ${insertErr.message}`;
      console.error("[procurementIngest] project insert failed", msg);
      insertErrors.push(msg);
      continue;
    }
    ids.push(projectId);

    // Insert each contact
    if (Array.isArray(p.project_contacts)) {
      for (const c of p.project_contacts) {
        if (!c || !c.full_name) continue;
        const contactRow = {
          project_id: projectId,
          contact_role: mapRoleTag(c.role_tag),
          full_name: c.full_name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          title: c.title ?? null,
          company: p.owner_name ?? null,
          source: "voice_agent",
          confidence:
            typeof c.confidence === "number"
              ? Math.round(c.confidence)
              : 50,
          inferred: false
        };
        const { error: contactErr } = await supabase
          .from("project_contacts")
          .insert(contactRow);
        if (contactErr) {
          const msg = `contact ${c.full_name} on ${projectId}: ${contactErr.message}`;
          console.error("[procurementIngest] contact insert failed", msg);
          insertErrors.push(msg);
        }
      }
    }
  }

  return {
    project_ids: ids,
    error: insertErrors.length
      ? `${insertErrors.length} insert error(s); first: ${insertErrors[0]}`
      : undefined,
    insert_errors: insertErrors.length ? insertErrors : undefined
  };
}
