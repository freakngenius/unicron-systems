// architectHistoryClient.ts — fetches the Architect History list for one org.
//
// SPEC: Company Docs/Metacron/SPEC - Customer Profile Architect History.md
// Wire: GET /api/internal/architect-history?slug=<org-slug> proxies to
// Pathfinder GET /api/organizations/:slug/architect-history.

import type {
  BusinessSummary,
  DecompositionArchitecture,
} from './contracts/architect';

export type ArchitectHistoryProposal = {
  id: string;
  type: string;
  headline: string;
  body: string | null;
  confidence: number | null;
  status: string;
  resolved_at: string | null;
  resolved_by_user_email: string | null;
};

export type ArchitectHistoryEntry = {
  session_id: string;
  session_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_cost_usd: number | null;
  goal: string | null;
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  proposal: ArchitectHistoryProposal | null;
};

export type ArchitectHistoryResponse = {
  org_slug: string;
  history: ArchitectHistoryEntry[];
};

export async function listArchitectHistory(
  slug: string,
  init?: { signal?: AbortSignal },
): Promise<ArchitectHistoryResponse> {
  const res = await fetch(
    `/api/internal/architect-history?slug=${encodeURIComponent(slug)}`,
    {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: init?.signal,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`architect-history ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as ArchitectHistoryResponse;
}

// Extract the buyer pain prompt the operator originally typed. Stream D
// stores it under `input_payload.buyer_pain_prompt` per
// services/architect/types.ts → DecompositionApiRequest.
export function extractBuyerPain(entry: ArchitectHistoryEntry): string | null {
  const p = entry.input_payload;
  if (!p || typeof p !== 'object') return null;
  const candidates = ['buyer_pain_prompt', 'buyer_pain', 'prompt', 'intent'];
  for (const key of candidates) {
    const v = (p as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

// The decomposition cluster (sources, agents, layer_*_watchers, layer_*_agents)
// + business_summary + ui_plan are persisted flat on the session's
// output_payload per Pathfinder/services/architect/types.ts.
export function extractArchitecture(
  entry: ArchitectHistoryEntry,
): DecompositionArchitecture | null {
  const o = entry.output_payload;
  if (!o || typeof o !== 'object') return null;
  return o as unknown as DecompositionArchitecture;
}

export function extractBusinessSummary(
  entry: ArchitectHistoryEntry,
): BusinessSummary | null {
  const arch = extractArchitecture(entry);
  if (!arch) return null;
  return arch.business_summary ?? null;
}

export function summarizeLeadType(entry: ArchitectHistoryEntry): string | null {
  const arch = extractArchitecture(entry);
  return arch?.business_summary?.lead_type ?? null;
}
