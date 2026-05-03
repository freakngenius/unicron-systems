// services/contact-enricher/providers/hunter.ts — Demo Polish UX Gate 8B.
//
// Hunter.io email verifier. Used by the orchestrator to upgrade a Clay /
// Apollo email_status='guessed' → 'verified' (or downgrade → 'invalid')
// before the contact lands in lead_contacts.
//
// Auth: ?api_key=${HUNTER_API_KEY} on the /email-verifier GET. Missing
// → noop. Hunter's response shape:
//   { data: { status: 'valid' | 'invalid' | 'accept_all' | 'unknown',
//             score: 0..100, ... } }
//
// We map:
//   valid       → verified (high confidence)
//   accept_all  → unknown  (catch-all server; can't disambiguate)
//   invalid     → invalid
//   anything else → unknown

import { recordProviderCall } from '../cost-recorder';
import type { EmailStatus, EmailVerifier } from './types';

const DEFAULT_BASE_URL = 'https://api.hunter.io/v2';
const DEFAULT_TIMEOUT_MS = 15_000;
// Hunter charges per request on the basic tier; verifier costs ~ a fraction
// of a cent per call. Conservative estimate.
const DEFAULT_COST_PER_VERIFY_USD = 0.01;

interface HunterApiResponse {
  data?: {
    status?: string;
    score?: number;
    result?: string;
  };
}

export interface HunterConfig {
  apiKey: string;
  baseUrl: string;
  costPerVerifyUsd: number;
  timeoutMs: number;
}

export function readHunterConfig(): HunterConfig | null {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.HUNTER_API_BASE_URL || DEFAULT_BASE_URL;
  const costRaw = process.env.HUNTER_COST_PER_VERIFY_USD;
  const cost =
    costRaw && Number.isFinite(Number(costRaw))
      ? Number(costRaw)
      : DEFAULT_COST_PER_VERIFY_USD;
  return {
    apiKey,
    baseUrl,
    costPerVerifyUsd: cost,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

export function mapHunterStatus(raw: string | undefined): EmailStatus {
  if (!raw) return 'unknown';
  const v = raw.toLowerCase();
  if (v === 'valid' || v === 'deliverable') return 'verified';
  if (v === 'invalid' || v === 'undeliverable') return 'invalid';
  if (v === 'accept_all' || v === 'webmail' || v === 'unknown') return 'unknown';
  return 'unknown';
}

export class HunterEmailVerifier implements EmailVerifier {
  readonly provider = 'hunter' as const;

  constructor(private readonly config: HunterConfig | null = readHunterConfig()) {}

  async verifyEmail(email: string): Promise<{
    status: EmailStatus;
    confidence: number;
    cost_usd: number;
  }> {
    const startedAt = Date.now();
    if (!this.config) {
      return { status: 'unknown', confidence: 0, cost_usd: 0 };
    }
    const url = `${this.config.baseUrl}/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(this.config.apiKey)}`;
    let json: unknown = null;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        json = null;
      } else {
        json = await res.json().catch(() => null);
      }
    } catch {
      json = null;
    }
    const latency = Date.now() - startedAt;
    const cost = json ? this.config.costPerVerifyUsd : 0;
    if (cost > 0) {
      recordProviderCall({
        provider: this.provider,
        operation: 'verify-email',
        costUsd: cost,
        latencyMs: latency,
      });
    }
    if (!json || typeof json !== 'object') {
      return { status: 'unknown', confidence: 0, cost_usd: cost };
    }
    const data = (json as HunterApiResponse).data;
    const status = mapHunterStatus(data?.status ?? data?.result);
    const score = typeof data?.score === 'number' ? data.score : 0;
    // Hunter score is 0..100; normalize to 0..1.
    const confidence = Math.max(0, Math.min(1, score / 100));
    return { status, confidence, cost_usd: cost };
  }
}
