// GET /api/atrium/services-health
//
// Live health checks for the Atrium "Services Health" panel.
// Addresses audit item #14 (atrium-realtime-audit-2026-05-21.md):
//   "Services Health — implement the live health checks promised in the
//    ServicesHealth.tsx:3 comment ("Live health checks wire in Sprint 7");
//    ping Supabase, Notion, Slack, Inngest, GitHub, Vercel and color-code
//    each card by status."
//
// Pings all six services in parallel with a 4s per-call timeout. Returns a
// uniform { services: [...], fetched_at } shape. Cache-Control allows the
// browser/edge to serve a 30s fresh response with 60s stale-while-revalidate
// so the UI gets near-live data without hammering upstreams.

import type { VercelRequest, VercelResponse } from '@vercel/node';

type ServiceId = 'supabase' | 'notion' | 'slack' | 'inngest' | 'github' | 'vercel';
type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unconfigured';

interface ServiceHealth {
  id: ServiceId;
  name: string;
  status: ServiceStatus;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
}

interface CheckResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
}

const TIMEOUT_MS = 4000;
const DEGRADED_THRESHOLD_MS = 2000;

function classify(latencyMs: number, result: CheckResult): ServiceStatus {
  if (!result.ok) return 'down';
  return latencyMs >= DEGRADED_THRESHOLD_MS ? 'degraded' : 'healthy';
}

async function timedFetch(
  url: string,
  init: RequestInit,
): Promise<{ latency_ms: number; result: CheckResult }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const latency_ms = Date.now() - started;
    if (!res.ok) {
      return {
        latency_ms,
        result: {
          ok: false,
          statusCode: res.status,
          error: `HTTP ${res.status}`,
        },
      };
    }
    return { latency_ms, result: { ok: true, statusCode: res.status, error: null } };
  } catch (err) {
    const latency_ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes('timeout') || message.includes('aborted');
    return {
      latency_ms,
      result: {
        ok: false,
        statusCode: null,
        error: isTimeout ? `Timeout after ${TIMEOUT_MS}ms` : message,
      },
    };
  }
}

function unconfigured(id: ServiceId, name: string, reason: string): ServiceHealth {
  return {
    id,
    name,
    status: 'unconfigured',
    latency_ms: null,
    error: reason,
    checked_at: new Date().toISOString(),
  };
}

async function checkSupabase(): Promise<ServiceHealth> {
  const name = 'Supabase';
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    return unconfigured('supabase', name, 'SUPABASE_URL or SUPABASE_ANON_KEY missing');
  }
  // HEAD on the PostgREST root returns 200 when the project is up.
  const { latency_ms, result } = await timedFetch(`${url}/rest/v1/`, {
    method: 'GET',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  return {
    id: 'supabase',
    name,
    status: classify(latency_ms, result),
    latency_ms,
    error: result.error,
    checked_at: new Date().toISOString(),
  };
}

async function checkNotion(): Promise<ServiceHealth> {
  const name = 'Notion';
  const token = process.env.NOTION_TOKEN;
  if (!token) return unconfigured('notion', name, 'NOTION_TOKEN missing');
  const { latency_ms, result } = await timedFetch('https://api.notion.com/v1/users/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  });
  return {
    id: 'notion',
    name,
    status: classify(latency_ms, result),
    latency_ms,
    error: result.error,
    checked_at: new Date().toISOString(),
  };
}

async function checkSlack(): Promise<ServiceHealth> {
  const name = 'Slack';
  const token = process.env.SLACK_BOT_TOKEN ?? process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
  if (!token) {
    return unconfigured('slack', name, 'SLACK_BOT_TOKEN missing');
  }
  const started = Date.now();
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latency_ms = Date.now() - started;
    if (!res.ok) {
      return {
        id: 'slack',
        name,
        status: 'down',
        latency_ms,
        error: `HTTP ${res.status}`,
        checked_at: new Date().toISOString(),
      };
    }
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!body.ok) {
      return {
        id: 'slack',
        name,
        status: 'down',
        latency_ms,
        error: body.error ?? 'auth.test returned ok:false',
        checked_at: new Date().toISOString(),
      };
    }
    return {
      id: 'slack',
      name,
      status: latency_ms >= DEGRADED_THRESHOLD_MS ? 'degraded' : 'healthy',
      latency_ms,
      error: null,
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    const latency_ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes('timeout') || message.includes('aborted');
    return {
      id: 'slack',
      name,
      status: 'down',
      latency_ms,
      error: isTimeout ? `Timeout after ${TIMEOUT_MS}ms` : message,
      checked_at: new Date().toISOString(),
    };
  }
}

async function checkInngest(): Promise<ServiceHealth> {
  const name = 'Inngest';
  // Inngest exposes a public health endpoint. INNGEST_BASE_URL allows pointing
  // at a self-hosted dev server when configured.
  const base = process.env.INNGEST_BASE_URL ?? 'https://api.inngest.com';
  const { latency_ms, result } = await timedFetch(`${base}/health`, { method: 'GET' });
  return {
    id: 'inngest',
    name,
    status: classify(latency_ms, result),
    latency_ms,
    error: result.error,
    checked_at: new Date().toISOString(),
  };
}

async function checkGitHub(): Promise<ServiceHealth> {
  const name = 'GitHub (Vault)';
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return unconfigured('github', name, 'GITHUB_VAULT_TOKEN missing');
  const { latency_ms, result } = await timedFetch('https://api.github.com/rate_limit', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'unicron-platform/1.0',
    },
  });
  return {
    id: 'github',
    name,
    status: classify(latency_ms, result),
    latency_ms,
    error: result.error,
    checked_at: new Date().toISOString(),
  };
}

async function checkVercel(): Promise<ServiceHealth> {
  const name = 'Vercel';
  const token = process.env.VERCEL_TOKEN;
  if (!token) return unconfigured('vercel', name, 'VERCEL_TOKEN missing');
  const { latency_ms, result } = await timedFetch('https://api.vercel.com/v2/user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    id: 'vercel',
    name,
    status: classify(latency_ms, result),
    latency_ms,
    error: result.error,
    checked_at: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const checks: Array<Promise<ServiceHealth>> = [
    checkSupabase(),
    checkNotion(),
    checkSlack(),
    checkInngest(),
    checkGitHub(),
    checkVercel(),
  ];

  const settled = await Promise.allSettled(checks);
  const fallbackOrder: Array<{ id: ServiceId; name: string }> = [
    { id: 'supabase', name: 'Supabase' },
    { id: 'notion', name: 'Notion' },
    { id: 'slack', name: 'Slack' },
    { id: 'inngest', name: 'Inngest' },
    { id: 'github', name: 'GitHub (Vault)' },
    { id: 'vercel', name: 'Vercel' },
  ];

  const services: ServiceHealth[] = settled.map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    const meta = fallbackOrder[idx];
    return {
      id: meta.id,
      name: meta.name,
      status: 'down',
      latency_ms: null,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      checked_at: new Date().toISOString(),
    };
  });

  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.status(200).json({
    services,
    fetched_at: new Date().toISOString(),
  });
}
