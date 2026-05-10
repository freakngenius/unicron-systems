// Typed wrapper for the Stream E Coverage Expansion endpoints.
//
// Hits Pathfinder's `/api/coverage/goals*` routes via the configured base URL.
// As of 2026-05-02 the four real-mode endpoints are not yet shipped on
// Pathfinder — see MEMORY/operator-todos/2026-05-02-stream-e-coverage-http-routes.md.
// Calls will surface the underlying fetch error to the caller until those
// routes land; the UI is expected to render empty / error states.

import type {
  CoverageGoal,
  CoverageGoalDetail,
  CreateCoverageGoalInput,
  CreateCoverageGoalResponse,
  ListCoverageGoalsFilter,
  RunCoverageGoalResponse,
} from './contracts/coverage';

interface CoverageEnv {
  baseUrl: string;
  basicAuthHeader?: string;
}

function readEnv(): CoverageEnv {
  const baseUrlRaw = (import.meta.env.VITE_COVERAGE_API_URL as string | undefined) ?? '';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  const user = import.meta.env.VITE_COVERAGE_API_BASIC_USER as string | undefined;
  const pass = import.meta.env.VITE_COVERAGE_API_BASIC_PASS as string | undefined;
  const basicAuthHeader =
    user && pass ? `Basic ${btoa(`${user}:${pass}`)}` : undefined;
  return { baseUrl, basicAuthHeader };
}

async function fetchJson<T>(
  env: CoverageEnv,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!env.baseUrl) {
    throw new Error('VITE_COVERAGE_API_URL is required to call the coverage API');
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

export async function createCoverageGoal(
  input: CreateCoverageGoalInput,
): Promise<CreateCoverageGoalResponse> {
  const env = readEnv();
  return fetchJson<CreateCoverageGoalResponse>(env, '/api/coverage/goals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listCoverageGoals(
  filter: ListCoverageGoalsFilter = {},
): Promise<CoverageGoal[]> {
  const env = readEnv();
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

export async function getCoverageGoal(id: string): Promise<CoverageGoalDetail> {
  const env = readEnv();
  return fetchJson<CoverageGoalDetail>(env, `/api/coverage/goals/${encodeURIComponent(id)}`);
}

export async function runCoverageGoal(id: string): Promise<RunCoverageGoalResponse> {
  const env = readEnv();
  return fetchJson<RunCoverageGoalResponse>(
    env,
    `/api/coverage/goals/${encodeURIComponent(id)}/run`,
    { method: 'POST' },
  );
}

/** Test seam — returns the snapshotted env for assertions. */
export function __debugReadEnv(): CoverageEnv {
  return readEnv();
}
