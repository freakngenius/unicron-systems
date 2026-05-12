/**
 * HubSpot client. Used by the SDR call outcome writer.
 *
 * Reads HUBSPOT_PRIVATE_APP_TOKEN from env. If missing, all functions
 * return { ok: false, skipped: true } so callers can continue without
 * an integration configured.
 *
 * Endpoints used:
 *   POST /crm/v3/objects/contacts/search    (find contact by phone or email)
 *   POST /crm/v3/objects/contacts            (create contact)
 *   POST /crm/v3/objects/calls               (log call activity)
 *   POST /crm/v3/objects/calls/{callId}/associations/contacts/{contactId}/call_to_contact
 */

const BASE = "https://api.hubapi.com";

function token(): string | null {
  return process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? null;
}

async function hs<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const t = token();
  if (!t) return { ok: false, status: 0, data: null, error: "no token" };
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: r.ok, status: r.status, data, error: r.ok ? undefined : (data?.message ?? text) };
}

export async function findContactByPhone(phone: string) {
  return hs("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "phone", operator: "EQ", value: phone }] },
        { filters: [{ propertyName: "mobilephone", operator: "EQ", value: phone }] }
      ],
      properties: ["firstname", "lastname", "email", "phone", "company"],
      limit: 1
    })
  });
}

export async function findContactByEmail(email: string) {
  return hs("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] }
      ],
      properties: ["firstname", "lastname", "email", "phone", "company"],
      limit: 1
    })
  });
}

export async function createContact(props: {
  email?: string;
  phone?: string;
  firstname?: string;
  lastname?: string;
  company?: string;
}) {
  return hs("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties: props })
  });
}

/**
 * Log a call activity. Direction: INBOUND or OUTBOUND.
 * Status: COMPLETED, BUSY, NO_ANSWER, FAILED, etc.
 * Returns the created call id which we then associate to a contact.
 */
export async function logCall(args: {
  hs_call_body: string; // notes / summary
  hs_call_title: string;
  hs_call_direction: "INBOUND" | "OUTBOUND";
  hs_call_status:
    | "COMPLETED"
    | "BUSY"
    | "NO_ANSWER"
    | "FAILED"
    | "CANCELED"
    | "QUEUED"
    | "RINGING"
    | "IN_PROGRESS";
  hs_call_duration_ms?: number;
  hs_call_to_number?: string;
  hs_call_from_number?: string;
  hs_call_recording_url?: string;
  hs_timestamp?: number;
}) {
  const props: any = { ...args };
  props.hs_timestamp = args.hs_timestamp ?? Date.now();
  return hs("/crm/v3/objects/calls", {
    method: "POST",
    body: JSON.stringify({ properties: props })
  });
}

export async function associateCallToContact(callId: string, contactId: string) {
  return hs(
    `/crm/v3/objects/calls/${callId}/associations/contacts/${contactId}/call_to_contact`,
    { method: "PUT" }
  );
}

/**
 * High-level helper: log an SDR voice call outcome to HubSpot.
 * Looks up or creates a contact by phone, logs the call, associates them.
 */
export async function logSdrOutcome(args: {
  toPhone: string;
  fromPhone: string;
  contactName?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  outcome?: string | null;
  callStatus: string; // our internal status string
  recordingUrl?: string | null;
  endedAt?: string | null;
}): Promise<{
  ok: boolean;
  skipped: boolean;
  contact_id?: string;
  call_id?: string;
  error?: string;
}> {
  if (!token()) {
    return { ok: false, skipped: true, error: "HUBSPOT_PRIVATE_APP_TOKEN not set" };
  }

  // 1. Find or create contact
  let contactId: string | null = null;
  const found = await findContactByPhone(args.toPhone);
  if (found.ok && (found.data as any)?.results?.[0]) {
    contactId = (found.data as any).results[0].id;
  } else {
    // Best-effort split first/last name
    const [firstname, ...rest] = (args.contactName ?? "").trim().split(/\s+/);
    const created = await createContact({
      phone: args.toPhone,
      firstname: firstname || undefined,
      lastname: rest.join(" ") || undefined
    });
    if (created.ok && (created.data as any)?.id) {
      contactId = (created.data as any).id;
    }
  }

  // 2. Map our status -> HubSpot status
  const statusMap: Record<string, any> = {
    queued: "QUEUED",
    dialing: "RINGING",
    ringing: "RINGING",
    "in-progress": "IN_PROGRESS",
    ended: "COMPLETED",
    failed: "FAILED",
    rejected_not_allowlisted: "CANCELED"
  };
  const hsStatus = statusMap[args.callStatus] ?? "COMPLETED";

  const title = args.outcome
    ? `Unicron SDR call \u2014 ${args.outcome}`
    : `Unicron SDR call`;
  const body =
    (args.summary ?? "Auto-logged from Unicron Voice Agent") +
    (args.recordingUrl ? `\n\nRecording: ${args.recordingUrl}` : "");

  const callRes = await logCall({
    hs_call_title: title,
    hs_call_body: body,
    hs_call_direction: "OUTBOUND",
    hs_call_status: hsStatus,
    hs_call_duration_ms: args.durationSeconds
      ? args.durationSeconds * 1000
      : undefined,
    hs_call_to_number: args.toPhone,
    hs_call_from_number: args.fromPhone,
    hs_call_recording_url: args.recordingUrl ?? undefined,
    hs_timestamp: args.endedAt
      ? new Date(args.endedAt).getTime()
      : Date.now()
  });

  if (!callRes.ok) {
    return { ok: false, skipped: false, contact_id: contactId ?? undefined, error: callRes.error };
  }
  const callId = (callRes.data as any)?.id;

  // 3. Associate
  if (callId && contactId) {
    await associateCallToContact(callId, contactId);
  }

  return {
    ok: true,
    skipped: false,
    contact_id: contactId ?? undefined,
    call_id: callId
  };
}

/**
 * Simple in-memory cache for hubspot-mode allowlist lookups. Keyed by the
 * stringified filter so different pipelines/stages don't collide. 60s TTL.
 */
type CachedSet = { phones: Set<string>; at: number };
const HUBSPOT_PHONE_CACHE = new Map<string, CachedSet>();
const HUBSPOT_CACHE_TTL_MS = 60_000;

export type HubspotFilter = {
  pipeline_id?: string;
  stage_ids?: string[];
  /** Optional list_id (static or dynamic list) to scope to. */
  list_id?: string;
};

function filterCacheKey(filter: HubspotFilter | null | undefined): string {
  if (!filter) return "any-contact";
  return JSON.stringify({
    p: filter.pipeline_id ?? null,
    s: (filter.stage_ids ?? []).slice().sort(),
    l: filter.list_id ?? null
  });
}

/**
 * Build the set of allowed phones for a given filter. If pipeline + stages are
 * present, we walk deals in those stages, collect associated contact ids, then
 * fetch phones for those contacts. Without a filter we just check contact
 * existence directly per call (no precomputed set).
 */
async function loadHubspotPhones(
  filter: HubspotFilter
): Promise<{ ok: boolean; phones?: Set<string>; reason?: string }> {
  if (!token()) {
    return { ok: false, reason: "HUBSPOT_PRIVATE_APP_TOKEN not set" };
  }
  const cached = HUBSPOT_PHONE_CACHE.get(filterCacheKey(filter));
  if (cached && Date.now() - cached.at < HUBSPOT_CACHE_TTL_MS) {
    return { ok: true, phones: cached.phones };
  }

  const phones = new Set<string>();

  // Strategy 1: list membership. List members API returns contact vids; we then
  // batch-fetch contact phones.
  if (filter.list_id) {
    const memberRes = await hs<any>(
      `/contacts/v1/lists/${filter.list_id}/contacts/all?count=100`
    );
    if (!memberRes.ok || !memberRes.data) {
      return {
        ok: false,
        reason: `hubspot list fetch failed: ${memberRes.error ?? memberRes.status}`
      };
    }
    const vids: string[] = (memberRes.data?.contacts ?? [])
      .map((c: any) => String(c.vid))
      .filter(Boolean);
    for (let i = 0; i < vids.length; i += 100) {
      const chunk = vids.slice(i, i + 100);
      const batch = await hs<any>("/crm/v3/objects/contacts/batch/read", {
        method: "POST",
        body: JSON.stringify({
          inputs: chunk.map((id) => ({ id })),
          properties: ["phone", "mobilephone"]
        })
      });
      for (const r of batch.data?.results ?? []) {
        if (r.properties?.phone) phones.add(normalizeForCompare(r.properties.phone));
        if (r.properties?.mobilephone)
          phones.add(normalizeForCompare(r.properties.mobilephone));
      }
    }
  }

  // Strategy 2: pipeline + stage filter on deals. We pull deals in any of the
  // configured stages, get their associated contact ids, then read phones.
  if (filter.pipeline_id && (filter.stage_ids?.length ?? 0) > 0) {
    const dealsRes = await hs<any>("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: (filter.stage_ids ?? []).map((stageId) => ({
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: filter.pipeline_id },
            { propertyName: "dealstage", operator: "EQ", value: stageId }
          ]
        })),
        properties: ["dealname"],
        limit: 100
      })
    });
    if (!dealsRes.ok) {
      return {
        ok: false,
        reason: `hubspot deal search failed: ${dealsRes.error ?? dealsRes.status}`
      };
    }
    const dealIds: string[] = (dealsRes.data?.results ?? []).map((d: any) =>
      String(d.id)
    );
    // For each deal, get associated contact ids (batch associations).
    const contactIds = new Set<string>();
    for (let i = 0; i < dealIds.length; i += 100) {
      const chunk = dealIds.slice(i, i + 100);
      const assoc = await hs<any>(
        "/crm/v4/associations/deals/contacts/batch/read",
        {
          method: "POST",
          body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) })
        }
      );
      for (const r of assoc.data?.results ?? []) {
        for (const t of r.to ?? []) {
          if (t.toObjectId) contactIds.add(String(t.toObjectId));
        }
      }
    }
    // Read phones for those contacts in batches of 100.
    const idArr = Array.from(contactIds);
    for (let i = 0; i < idArr.length; i += 100) {
      const chunk = idArr.slice(i, i + 100);
      const batch = await hs<any>("/crm/v3/objects/contacts/batch/read", {
        method: "POST",
        body: JSON.stringify({
          inputs: chunk.map((id) => ({ id })),
          properties: ["phone", "mobilephone"]
        })
      });
      for (const r of batch.data?.results ?? []) {
        if (r.properties?.phone)
          phones.add(normalizeForCompare(r.properties.phone));
        if (r.properties?.mobilephone)
          phones.add(normalizeForCompare(r.properties.mobilephone));
      }
    }
  }

  HUBSPOT_PHONE_CACHE.set(filterCacheKey(filter), {
    phones,
    at: Date.now()
  });
  return { ok: true, phones };
}

function normalizeForCompare(input: string): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "";
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : "";
}

/**
 * Check whether a phone is permitted under hubspot mode. If the source has a
 * filter (pipeline+stages or list), the phone must match a contact found via
 * that filter. Otherwise we fall back to a direct contact lookup by phone.
 */
export async function phoneInHubspotFilter(
  phone: string,
  filter: HubspotFilter | null | undefined
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!token()) {
    return { ok: false, reason: "HUBSPOT_PRIVATE_APP_TOKEN not set" };
  }
  const normalized = normalizeForCompare(phone);

  // Filtered mode: precomputed set of allowed phones.
  if (filter && (filter.list_id || (filter.pipeline_id && (filter.stage_ids?.length ?? 0) > 0))) {
    const r = await loadHubspotPhones(filter);
    if (!r.ok) return { ok: false, reason: r.reason ?? "hubspot filter failed" };
    if (!r.phones || !r.phones.has(normalized)) {
      return { ok: false, reason: "phone not in HubSpot filter result set" };
    }
    return { ok: true };
  }

  // Unfiltered hubspot mode: any contact in the HubSpot account qualifies.
  const found = await findContactByPhone(phone);
  if (!found.ok) {
    return { ok: false, reason: `hubspot lookup failed: ${found.error ?? found.status}` };
  }
  if (!(found.data as any)?.results?.[0]) {
    return { ok: false, reason: "no matching HubSpot contact" };
  }
  return { ok: true };
}
