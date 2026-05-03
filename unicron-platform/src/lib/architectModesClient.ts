// Tune + Discover endpoints for the Architect Modal (Phase 1 / Stream M4).
//
// Decomposition is already wrapped by `architectClient.ts` (Stream C ↔ D
// reconciliation). Tuning + Discovery are NEW code paths — Stream D ships
// the routes but `architectClient.ts` was kept stable per the audit. This
// file lives alongside it so the existing Architect Inbox flow stays
// untouched.

import type {
  DecompositionApiRequest,
  DecompositionApiResponse,
  TuningApiRequest,
  TuningApiResponse,
  DiscoveryApiRequest,
  DiscoveryApiResponse,
} from './contracts/architect';
import {
  architectDecompositionMock,
  architectTuningMock,
  architectDiscoveryMock,
} from '../data/mocks';

interface ArchitectEnv {
  enabled: boolean;
  baseUrl: string;
  bearer?: string;
}

function readEnv(): ArchitectEnv {
  const enabled = import.meta.env.VITE_ARCHITECT_API_ENABLED === 'true';
  const baseUrlRaw = (import.meta.env.VITE_ARCHITECT_API_URL as string | undefined) ?? '';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  const bearer = import.meta.env.VITE_ARCHITECT_API_TOKEN as string | undefined;
  return { enabled, baseUrl, bearer };
}

async function postJson<TReq, TRes>(
  env: ArchitectEnv,
  path: string,
  body: TReq,
): Promise<TRes> {
  if (!env.baseUrl) {
    throw new Error('VITE_ARCHITECT_API_URL is required when VITE_ARCHITECT_API_ENABLED=true');
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (env.bearer) headers.authorization = `Bearer ${env.bearer}`;
  const res = await fetch(`${env.baseUrl}${path}`, {
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

async function mockDelay(ms = 350): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  const env = readEnv();
  if (env.enabled) {
    return postJson<DecompositionApiRequest, DecompositionApiResponse>(
      env,
      '/api/architect/decompose',
      req,
    );
  }
  await mockDelay();
  return architectDecompositionMock;
}

export async function postArchitectTune(req: TuningApiRequest): Promise<TuningApiResponse> {
  const env = readEnv();
  if (env.enabled) {
    return postJson<TuningApiRequest, TuningApiResponse>(env, '/api/architect/tune', req);
  }
  await mockDelay();
  return architectTuningMock;
}

export async function postArchitectDiscover(
  req: DiscoveryApiRequest,
): Promise<DiscoveryApiResponse> {
  const env = readEnv();
  if (env.enabled) {
    return postJson<DiscoveryApiRequest, DiscoveryApiResponse>(env, '/api/architect/discover', req);
  }
  await mockDelay();
  return architectDiscoveryMock;
}

/** Test seam — returns the snapshotted env for assertions. */
export function __debugReadEnv(): ArchitectEnv {
  return readEnv();
}
