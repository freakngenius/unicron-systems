// Tune + Discover endpoints for the Architect Modal (Phase 1 / Stream M4).
//
// Decomposition is already wrapped by `architectClient.ts` (Stream C ↔ D
// reconciliation). Tuning + Discovery are NEW code paths — Stream D ships
// the routes but `architectClient.ts` was kept stable per the audit. This
// file lives alongside it so the existing Architect Inbox flow stays
// untouched.
//
// Wave 3 Phase B: calls now route through same-origin Vercel serverless
// proxies (`/api/architect/{decompose,tune,discover}-proxy`) which inject
// `ARCHITECT_API_TOKEN` server-side. Browser no longer holds tokens.

import type {
  DecompositionApiRequest,
  DecompositionApiResponse,
  TuningApiRequest,
  TuningApiResponse,
  DiscoveryApiRequest,
  DiscoveryApiResponse,
} from './contracts/architect';

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`architect api ${res.status} ${path} — ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TRes;
}

/**
 * Canonical-shape decomposition POST. The existing `architectClient.postDecomposition`
 * is kept for backwards compat with the legacy `{ buyerPain }` shape used by
 * Architect Inbox; this function speaks the Stream D `{ buyer_pain_prompt }`
 * shape directly so the M4 modal can pass through unchanged.
 */
export async function postArchitectDecompose(
  req: DecompositionApiRequest,
): Promise<DecompositionApiResponse> {
  return postJson<DecompositionApiRequest, DecompositionApiResponse>(
    '/api/architect/decompose-proxy',
    req,
  );
}

export async function postArchitectTune(req: TuningApiRequest): Promise<TuningApiResponse> {
  return postJson<TuningApiRequest, TuningApiResponse>('/api/architect/tune-proxy', req);
}

export async function postArchitectDiscover(
  req: DiscoveryApiRequest,
): Promise<DiscoveryApiResponse> {
  return postJson<DiscoveryApiRequest, DiscoveryApiResponse>('/api/architect/discover-proxy', req);
}
