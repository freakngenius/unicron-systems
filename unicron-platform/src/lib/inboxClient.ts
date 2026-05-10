// Typed wrapper for the Stream E architect_inbox endpoints.
// Real-only: hits same-origin Vercel proxies
// (`/api/architect/inbox-proxy`, `/api/architect/inbox-resolve-proxy`) which
// inject `ARCHITECT_API_TOKEN` server-side and forward to Pathfinder.
// Mock fallback was removed; callers receive whatever the real API returns
// (including empty arrays — the UI renders an empty state).

import type {
  InboxCategory,
  ListInboxFilter,
  ListInboxResponse,
  ResolveInboxRequest,
  ResolveInboxResponse,
} from './contracts/inbox';

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`inbox api ${res.status} ${path} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function listInboxTickets(
  filter: ListInboxFilter = {},
): Promise<ListInboxResponse> {
  const category: InboxCategory = filter.category ?? 'source-discovery';
  const status = filter.status ?? 'open';
  const params = new URLSearchParams({ category, status });
  if (filter.limit) params.set('limit', String(filter.limit));
  return fetchJson<ListInboxResponse>(`/api/architect/inbox-proxy?${params.toString()}`);
}

export async function resolveInboxTicket(
  id: string,
  body: ResolveInboxRequest,
): Promise<ResolveInboxResponse> {
  const params = new URLSearchParams({ id });
  return fetchJson<ResolveInboxResponse>(
    `/api/architect/inbox-resolve-proxy?${params.toString()}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
