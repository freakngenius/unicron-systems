// Typed wrapper for the Stream E architect_inbox endpoints.
// Real-mode (VITE_ARCHITECT_API_ENABLED=true): hits Pathfinder's
// `/api/architect/inbox*` routes via VITE_ARCHITECT_API_URL.
// Mock-mode (default): returns fixtures from `src/data/mocks.ts`.

import type {
  InboxCategory,
  InboxTicket,
  ListInboxFilter,
  ListInboxResponse,
  ResolveInboxRequest,
  ResolveInboxResponse,
} from './contracts/inbox';
import { inboxTicketsMock } from '../data/mocks';

interface InboxEnv {
  enabled: boolean;
  baseUrl: string;
  basicAuthHeader?: string;
}

function readEnv(): InboxEnv {
  const enabled = import.meta.env.VITE_ARCHITECT_API_ENABLED === 'true';
  const baseUrlRaw = (import.meta.env.VITE_ARCHITECT_API_URL as string | undefined) ?? '';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  const user = import.meta.env.VITE_ARCHITECT_API_BASIC_USER as string | undefined;
  const pass = import.meta.env.VITE_ARCHITECT_API_BASIC_PASS as string | undefined;
  const basicAuthHeader =
    user && pass ? `Basic ${btoa(`${user}:${pass}`)}` : undefined;
  return { enabled, baseUrl, basicAuthHeader };
}

async function fetchJson<T>(
  env: InboxEnv,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!env.baseUrl) {
    throw new Error(
      'VITE_ARCHITECT_API_URL is required when VITE_ARCHITECT_API_ENABLED=true',
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
    throw new Error(`inbox api ${res.status} ${path} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function mockDelay(ms = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listInboxTickets(
  filter: ListInboxFilter = {},
): Promise<ListInboxResponse> {
  const env = readEnv();
  const category: InboxCategory = filter.category ?? 'source-discovery';
  const status = filter.status ?? 'open';
  if (env.enabled) {
    const params = new URLSearchParams({ category, status });
    if (filter.limit) params.set('limit', String(filter.limit));
    return fetchJson<ListInboxResponse>(env, `/api/architect/inbox?${params.toString()}`);
  }
  await mockDelay();
  let tickets: InboxTicket[] = inboxTicketsMock.filter(
    (t) => t.category === category && t.status === status,
  );
  if (filter.limit) tickets = tickets.slice(0, filter.limit);
  return { tickets, category, status };
}

export async function resolveInboxTicket(
  id: string,
  body: ResolveInboxRequest,
): Promise<ResolveInboxResponse> {
  const env = readEnv();
  if (env.enabled) {
    return fetchJson<ResolveInboxResponse>(
      env,
      `/api/architect/inbox/${encodeURIComponent(id)}/resolve`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }
  await mockDelay();
  if (body.resolution === 'dismiss') return { status: 'dismissed' };
  if (body.resolution === 'manual') return { status: 'resolved' };
  return { status: 'queued', request_id: `mock-resume-${Date.now()}` };
}

/** Test seam — returns the snapshotted env for assertions. */
export function __debugReadEnv(): InboxEnv {
  return readEnv();
}
