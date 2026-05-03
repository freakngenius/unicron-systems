// Architect client.
//
// When `VITE_ARCHITECT_API_ENABLED=true`, calls the same-origin Vercel
// serverless proxy at `/api/architect/decompose-proxy`, which injects the
// server-side `ARCHITECT_API_TOKEN` and forwards to Stream D's real HTTP
// API at `ARCHITECT_API_URL`. Otherwise returns mock fixtures shaped to
// the legacy UI types.
//
// Why the proxy: holding the bearer token server-side keeps it out of
// the browser bundle (Wave 3 Phase B). The proxy adds the Authorization
// header; clients no longer touch tokens.
//
// `listProposals` still reads `pathfinder.architect_proposals` directly
// via the supabase anon client — Stream D doesn't ship a list-proposals
// HTTP endpoint and the table is anon-readable.
//
// Approve / dismiss: Stream D doesn't ship HTTP endpoints; we write
// `architect_proposals.status` directly via the supabase anon client.
// (RLS allows anon SELECT but writes are service-role only — operators
// approving from the UI need an authenticated supabase session whose
// JWT carries write permissions, OR a deferred follow-up that adds an
// `/api/architect/proposals/:id/{approve,dismiss}` endpoint backed by
// service-role. For Phase 2 single-tenant ops, the supabase anon path
// will fail closed; the UI shows the optimistic remove + a console
// warning. This is documented in audit-unicron-platform.md.)

import { getEnv } from './env';
import { getSupabase } from './supabase';
import {
  archProposalRowToLegacy,
  decompositionApiToLegacy,
} from './architectAdapters';
import {
  proposals as mockProposals,
  architectDecompositionMock,
} from '../data/mocks';
import {
  type ArchitectProposalRow,
  type ApproveProposalResponse,
  type DecompositionApiRequest,
  type DecompositionApiResponse,
  type DecompositionRequest,
  type DecompositionResponse,
  type DismissProposalResponse,
  type ListProposalsResponse,
  type Proposal,
} from './contracts/architect';
import { __testing as systemTesting } from '../context/SystemContext';

function realEnabled(): boolean {
  return getEnv().architectApiEnabled;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Architect API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---- Decomposition -------------------------------------------------------

export async function postDecomposition(
  req: DecompositionRequest,
): Promise<DecompositionResponse> {
  if (realEnabled()) {
    const body: DecompositionApiRequest = { buyer_pain_prompt: req.buyerPain };
    const api = await fetchJson<DecompositionApiResponse>('/api/architect/decompose-proxy', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return decompositionApiToLegacy(api, req.buyerPain);
  }

  // Mock: derive a structured architecture from the canonical mock and echo
  // the user's buyer-pain into the `buyer` field so two distinct inputs
  // produce visibly distinct architectures (the rendered BUYER + the
  // recommendedConfig.buyerPain both reflect the input). Real-mode uses the
  // /decompose endpoint; this branch only runs when VITE_ARCHITECT_API_ENABLED
  // is unset / false.
  const trimmed = req.buyerPain.trim();
  const echoedBuyer = trimmed.length > 0 ? trimmed : architectDecompositionMock.architecture.buyer;
  const mockArchitecture = {
    ...architectDecompositionMock.architecture,
    buyer: echoedBuyer,
  };
  const apiResponse: DecompositionApiResponse = {
    ...architectDecompositionMock,
    session_id: `mock-${Date.now()}`,
    architecture: mockArchitecture,
  };
  return decompositionApiToLegacy(apiResponse, req.buyerPain);
}

// ---- Proposals -----------------------------------------------------------

export async function listProposals(): Promise<ListProposalsResponse> {
  if (realEnabled()) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .schema('pathfinder')
      .from('architect_proposals')
      .select('id, session_id, vertical_id, type, headline, body, details, confidence, status, resolved_at, resolved_by_user_email, resolution_notes, source_input_summary, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`architect_proposals read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as ArchitectProposalRow[];
    return { proposals: rows.map(archProposalRowToLegacy) };
  }

  const proposals: Proposal[] = mockProposals.map((p) => ({
    id: p.id,
    category: p.category,
    type: p.type,
    time: p.time,
    headline: p.headline,
    body: p.body,
    details: p.details,
  }));
  return { proposals };
}

export async function approveProposal(
  id: string,
): Promise<ApproveProposalResponse> {
  if (realEnabled()) {
    await writeProposalStatus(id, 'approved');
    // Server-side dispatch (Source Onboarder, agent installs) is not yet
    // wired — Stream D doesn't ship an approve HTTP endpoint. Operator UI
    // applies the SystemContext mutation client-side (fallbackApply in
    // ArchitectInbox.tsx) until the server-side flow lands. The returned
    // SystemConfig is whatever's in scope; we echo the test default since
    // there's no canonical "post-apply config" the server returns.
    return {
      ok: true as const,
      systemConfig: systemTesting.buildDefaultArchitecture('approved'),
    };
  }
  // Mock: client-side apply is handled by ArchitectInbox.tsx via SystemContext.
  return {
    ok: true as const,
    systemConfig: systemTesting.buildDefaultArchitecture('mock'),
  };
}

export async function dismissProposal(
  id: string,
  reason?: string,
): Promise<DismissProposalResponse> {
  if (realEnabled()) {
    await writeProposalStatus(id, 'dismissed', reason);
    return { ok: true as const };
  }
  return { ok: true as const };
}

async function writeProposalStatus(
  id: string,
  status: 'approved' | 'dismissed',
  resolution_notes?: string,
): Promise<void> {
  const supabase = getSupabase();
  const env = getEnv();
  const patch: Record<string, unknown> = {
    status,
    resolved_at: new Date().toISOString(),
    resolved_by_user_email: env.operatorEmail ?? null,
  };
  if (resolution_notes) patch.resolution_notes = resolution_notes;
  const { error } = await supabase
    .schema('pathfinder')
    .from('architect_proposals')
    .update(patch)
    .eq('id', id);
  if (error) {
    // RLS rejection is the most likely failure when the platform's anon
    // client doesn't have an authenticated session granting write to
    // architect_proposals. Surface clearly so the operator todo is
    // actionable: either auth the supabase session or add a server-side
    // approve endpoint.
    throw new Error(
      `architect_proposals.${status} write rejected (likely RLS). ` +
        `Either authenticate the supabase session or wait for Stream D's ` +
        `approve endpoint. supabase: ${error.message}`,
    );
  }
}
