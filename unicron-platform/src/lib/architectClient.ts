// Architect client. When `VITE_ARCHITECT_API_ENABLED=true`, hits the real
// Stream D HTTP API at `VITE_ARCHITECT_API_URL`. Otherwise returns mock
// fixtures shaped against the contracts in `./contracts/architect.ts`.
//
// The swap is a one-line config flip: setting the env flag is the only
// change needed when Stream D ships. All call sites import from here, so
// they're agnostic to the backing implementation.
//
// **TODO[stream-d-mock]**: Once Stream D's STREAM-README publishes the
// canonical contract, regenerate the mock fixtures so they match exactly.

import { getEnv } from './env';
import {
  proposals as mockProposals,
  decompositionLines as mockDecompLines,
  decompositionConfidence as mockConfidence,
  decompositionCostLine as mockCostLine,
} from '../data/mocks';
import {
  type DecompositionRequest,
  type DecompositionResponse,
  type DecompositionLine,
  type ListProposalsResponse,
  type ApproveProposalResponse,
  type DismissProposalResponse,
  type Proposal,
} from './contracts/architect';
import { __testing as systemTesting } from '../context/SystemContext';

function architectApiUrl(): string | undefined {
  return import.meta.env.VITE_ARCHITECT_API_URL as string | undefined;
}

function realEnabled(): boolean {
  return getEnv().architectApiEnabled && Boolean(architectApiUrl());
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = architectApiUrl();
  if (!base) throw new Error('VITE_ARCHITECT_API_URL is not configured');
  const url = `${base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...init,
  });
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
    return fetchJson<DecompositionResponse>('/decomposition', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  // Mock: structurally matches the projected contract; ignores `buyerPain`.
  const lines: DecompositionLine[] = mockDecompLines.map((text, i) => ({
    index: i,
    text,
    kind: detectKind(text),
  }));
  if (mockCostLine) {
    lines.push({ index: lines.length, text: mockCostLine, kind: 'cost' });
  }
  return {
    sessionId: `mock-${Date.now()}`,
    lines,
    recommendedConfig: systemTesting.buildDefaultArchitecture(req.buyerPain),
    confidence: parseFloat(mockConfidence.replace(/[^\d.]/g, '')) || 0.83,
  };
}

function detectKind(line: string): DecompositionLine['kind'] {
  const upper = line.trim().toUpperCase();
  if (upper.startsWith('BUYER')) return 'buyer';
  if (upper.startsWith('BUYING SIGNAL')) return 'signal';
  if (upper.startsWith('PUBLIC DATA')) return 'data';
  if (upper.startsWith('PROPOSED ARCHITECTURE')) return 'arch';
  if (upper.startsWith('CONFIDENCE')) return 'confidence';
  return 'header';
}

// ---- Proposals -----------------------------------------------------------

export async function listProposals(): Promise<ListProposalsResponse> {
  if (realEnabled()) return fetchJson<ListProposalsResponse>('/proposals');

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
    return fetchJson<ApproveProposalResponse>(`/proposals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });
  }
  // Mock: client-side apply is handled by ArchitectInbox.tsx via SystemContext
  // mutators; the response just acknowledges so the UI can advance.
  return {
    ok: true as const,
    systemConfig: systemTesting.buildDefaultArchitecture('mock'),
  };
}

export async function dismissProposal(
  id: string,
): Promise<DismissProposalResponse> {
  if (realEnabled()) {
    return fetchJson<DismissProposalResponse>(`/proposals/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
    });
  }
  return { ok: true as const };
}
