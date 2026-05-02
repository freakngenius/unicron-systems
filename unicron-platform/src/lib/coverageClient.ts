// Typed wrapper for the Stream E Coverage Expansion endpoints.
//
// Real-mode (VITE_COVERAGE_API_ENABLED=true): hits Pathfinder's
// `/api/coverage/goals*` routes via the configured base URL.
// Mock-mode (default): returns fixtures from `src/data/mocks.ts` so the
// modal is fully demoable without the Pathfinder backend.
//
// As of 2026-05-02 the four real-mode endpoints are not yet shipped on
// Pathfinder — see MEMORY/operator-todos/2026-05-02-stream-e-coverage-http-routes.md.
// The toggle is therefore documented but defaults off.

import type {
  CoverageGoal,
  CoverageGoalDetail,
  CreateCoverageGoalInput,
  CreateCoverageGoalResponse,
  ListCoverageGoalsFilter,
  RunCoverageGoalResponse,
} from './contracts/coverage';
import { coverageGoalsMock, buildCoverageGoalDetailMock } from '../data/mocks';

interface CoverageEnv {
  enabled: boolean;
  baseUrl: string;
  basicAuthHeader?: string;
}

function readEnv(): CoverageEnv {
  const enabled = import.meta.env.VITE_COVERAGE_API_ENABLED === 'true';
  const baseUrlRaw = (import.meta.env.VITE_COVERAGE_API_URL as string | undefined) ?? '';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  const user = import.meta.env.VITE_COVERAGE_API_BASIC_USER as string | undefined;
  const pass = import.meta.env.VITE_COVERAGE_API_BASIC_PASS as string | undefined;
  const basicAuthHeader =
    user && pass ? `Basic ${btoa(`${user}:${pass}`)}` : undefined;
  return { enabled, baseUrl, basicAuthHeader };
}

async function fetchJson<T>(
  env: CoverageEnv,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!env.baseUrl) {
    throw new Error(
      'VITE_COVERAGE_API_URL is required when VITE_COVERAGE_API_ENABLED=true',
    );
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (env.basicAuthHeader) headers.authorization = env.basicAuthHeader;
  const res = await fetch(`${env.baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`coverage api ${res.status} ${path} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Approximate the wall-clock ux of a real call without burning real time. */
async function mockDelay(ms = 350): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createCoverageGoal(
  input: CreateCoverageGoalInput,
): Promise<CreateCoverageGoalResponse> {
  const env = readEnv();
  if (env.enabled) {
    return fetchJson<CreateCoverageGoalResponse>(env, '/api/coverage/goals', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  await mockDelay();
  return {
    goal_id: `mock-goal-${Date.now()}`,
    status: 'estimating',
  };
}

export async function listCoverageGoals(
  filter: ListCoverageGoalsFilter = {},
): Promise<CoverageGoal[]> {
  const env = readEnv();
  if (env.enabled) {
    const params = new URLSearchParams();
    if (filter.vertical_id) params.set('vertical_id', filter.vertical_id);
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return fetchJson<CoverageGoal[]>(
      env,
      `/api/coverage/goals${qs ? `?${qs}` : ''}`,
    );
  }
  await mockDelay(120);
  let rows = [...coverageGoalsMock];
  if (filter.vertical_id) rows = rows.filter((g) => g.vertical_id === filter.vertical_id);
  if (filter.status) rows = rows.filter((g) => g.status === filter.status);
  if (filter.limit) rows = rows.slice(0, filter.limit);
  return rows;
}

export async function getCoverageGoal(id: string): Promise<CoverageGoalDetail> {
  const env = readEnv();
  if (env.enabled) {
    return fetchJson<CoverageGoalDetail>(env, `/api/coverage/goals/${encodeURIComponent(id)}`);
  }
  await mockDelay(120);
  return buildCoverageGoalDetailMock(id);
}

export async function runCoverageGoal(id: string): Promise<RunCoverageGoalResponse> {
  const env = readEnv();
  if (env.enabled) {
    return fetchJson<RunCoverageGoalResponse>(
      env,
      `/api/coverage/goals/${encodeURIComponent(id)}/run`,
      { method: 'POST' },
    );
  }
  await mockDelay();
  return { ok: true, run_event_id: `mock-run-${Date.now()}` };
}

/** Test seam — returns the snapshotted env for assertions. */
export function __debugReadEnv(): CoverageEnv {
  return readEnv();
}
