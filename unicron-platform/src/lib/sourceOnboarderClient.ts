// Source Onboarder client — real-only.
//
// Hits the same-origin Vercel proxy (`/api/sources/onboard-proxy`) which
// injects `SOURCE_ONBOARDER_TOKEN` server-side and forwards to Stream E.
//
// Wave 3 Phase B moved the bearer off the client; the proxy adds it.

import {
  type AnalyzeRequest,
  type AnalysisResponse,
  type DeployRequest,
  type DeployResponse,
} from './contracts/sourceOnboarder';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Source Onboarder API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function analyze(req: AnalyzeRequest): Promise<AnalysisResponse> {
  // Phase B: `/analyze` was prototype shape; production analyze is part
  // of the onboard endpoint. Route through the same-origin proxy.
  return fetchJson<AnalysisResponse>('/api/sources/onboard-proxy?sync=1', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function deploy(req: DeployRequest): Promise<DeployResponse> {
  return fetchJson<DeployResponse>('/api/sources/onboard-proxy?sync=1', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
