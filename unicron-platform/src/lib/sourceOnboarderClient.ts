// Source Onboarder client. When `VITE_SOURCE_ONBOARDER_ENABLED=true`, hits
// the same-origin Vercel proxy (`/api/sources/onboard-proxy`) which injects
// `SOURCE_ONBOARDER_TOKEN` server-side and forwards to Stream E. Otherwise
// returns mock fixtures shaped against the contracts in
// `./contracts/sourceOnboarder.ts`.
//
// Wave 3 Phase B moved the bearer off the client; the proxy adds it.
//
// **TODO[stream-e-mock]**: Once Stream E's STREAM-README publishes the
// canonical contract, regenerate the mock fixtures so they match exactly.

import { getEnv } from './env';
import {
  type AnalyzeRequest,
  type AnalysisResponse,
  type DeployRequest,
  type DeployResponse,
} from './contracts/sourceOnboarder';

// Sacramento-flavored mock fixture shaped against the Stream E contract.
// Matches the Pixi/HTML demo's narrative so the demo path stays coherent
// when running against the mock client.
const MOCK_FIXTURE = {
  jurisdiction: 'Sacramento County',
  detectedAdapter: 'socrata' as const,
  sourceType: 'permits' as const,
  estimatedDailyVolume: 110,
  estimatedQualifiedPerDay: 7,
  fields: [
    { field: 'permit_id', guess: 'event.source_id', confidence: 0.99 },
    { field: 'filing_date', guess: 'event.timestamp', confidence: 0.98 },
    { field: 'valuation', guess: 'event.project_value', confidence: 0.95 },
    { field: 'description', guess: 'event.raw_text', confidence: 0.9 },
    { field: 'contractor_name', guess: '(absent — Enricher backfills)', confidence: 0.4 },
  ],
  confidence: 0.94,
};

function realEnabled(): boolean {
  return getEnv().sourceOnboarderEnabled;
}

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
  if (realEnabled()) {
    // Phase B: `/analyze` was prototype shape; production analyze is part
    // of the onboard endpoint. Route through the same-origin proxy.
    return fetchJson<AnalysisResponse>('/api/sources/onboard-proxy?sync=1', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  // Mock: Sacramento County Socrata-flavored fixture per MOCK_FIXTURE above.
  const id = `mock-${Date.now()}`;
  return {
    analysisId: id,
    jurisdiction: MOCK_FIXTURE.jurisdiction,
    sourceType: MOCK_FIXTURE.sourceType,
    detectedAdapter: MOCK_FIXTURE.detectedAdapter,
    estimatedDailyVolume: MOCK_FIXTURE.estimatedDailyVolume,
    estimatedQualifiedPerDay: MOCK_FIXTURE.estimatedQualifiedPerDay,
    fields: MOCK_FIXTURE.fields.map((f) => ({ ...f })),
    proposedSource: {
      id: `src-${id}`,
      type: 'permits',
      label: `${MOCK_FIXTURE.jurisdiction} permits`,
      jurisdiction: MOCK_FIXTURE.jurisdiction,
      pollFrequencyMs: 60 * 60_000,
      enabled: true,
      watcherRole: 'PermitWatcher',
      weight: 0.18,
    },
    proposedWatcher: {
      id: `agent-${id}`,
      layer: 2,
      role: 'PermitWatcher',
      instruction: `Poll ${MOCK_FIXTURE.jurisdiction} permit feed; normalize new filings into structured events.`,
      inputFrom: [],
      outputTo: ['a-qualifier'],
      dwellMs: 5000,
      passRate: 0.34,
      enabled: true,
    },
    confidence: MOCK_FIXTURE.confidence,
  };
}

export async function deploy(req: DeployRequest): Promise<DeployResponse> {
  if (realEnabled()) {
    return fetchJson<DeployResponse>('/api/sources/onboard-proxy?sync=1', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  // Mock: in the absence of E, the caller is responsible for adding the
  // proposedSource + proposedWatcher to SystemContext. The mock just
  // confirms.
  // Recover the analysis from the session by replaying analyze() — cheap
  // because the mock is deterministic.
  const analysis = await analyze({ tab: 'url', input: 'replay' });
  return {
    ok: true as const,
    source: { ...analysis.proposedSource, ...(req.overrides ?? {}) },
    watcher: analysis.proposedWatcher,
    firstEventMs: 12_000, // optimistic mock — Stream E's spec target is < 90 000ms
  };
}
