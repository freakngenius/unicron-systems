// lib/searches/api.ts, ICP Search S3.
//
// Thin typed HTTP client for the four /api/searches routes owned by S1.
// The front-end never touches Supabase directly for searches; it goes
// through these helpers so tests can mock global `fetch` and so the
// HTTP seam stays the only coupling between S3 and S1.
//
// Server callers pass a fully qualified base URL (built from the request
// host). Client callers can omit it and the fetch is relative.

import type {
  CreateSearchInput,
  CreateSearchResponse,
  SavedSearchDetailResponse,
  SavedSearchesListResponse,
  SearchLeadsResponse,
} from './types';

export interface SearchApiOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function joinUrl(baseUrl: string | undefined, path: string): string {
  if (!baseUrl) return path;
  return baseUrl.replace(/\/+$/, '') + path;
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new SearchApiError(`${label} ${res.status}: ${text || res.statusText}`, res.status);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new SearchApiError(`${label} returned non-JSON body: ${text.slice(0, 200)}`, res.status);
  }
}

export class SearchApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SearchApiError';
    this.status = status;
  }
}

export async function createSearch(
  input: CreateSearchInput,
  opts: SearchApiOptions = {},
): Promise<CreateSearchResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(joinUrl(opts.baseUrl, '/api/searches'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  return readJson<CreateSearchResponse>(res, 'POST /api/searches');
}

export async function listSearches(
  opts: SearchApiOptions = {},
): Promise<SavedSearchesListResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(joinUrl(opts.baseUrl, '/api/searches'), {
    cache: 'no-store',
    signal: opts.signal,
  });
  const body = await readJson<unknown>(res, 'GET /api/searches');
  return { searches: normalizeListBody(body, 'searches') as SavedSearchesListResponse['searches'] };
}

export async function getSearch(
  id: string,
  opts: SearchApiOptions = {},
): Promise<SavedSearchDetailResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(joinUrl(opts.baseUrl, `/api/searches/${encodeURIComponent(id)}`), {
    cache: 'no-store',
    signal: opts.signal,
  });
  return readJson<SavedSearchDetailResponse>(res, `GET /api/searches/${id}`);
}

export async function getSearchLeads(
  id: string,
  opts: SearchApiOptions = {},
): Promise<SearchLeadsResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(
    joinUrl(opts.baseUrl, `/api/searches/${encodeURIComponent(id)}/leads`),
    { cache: 'no-store', signal: opts.signal },
  );
  const body = await readJson<unknown>(res, `GET /api/searches/${id}/leads`);
  return { leads: normalizeListBody(body, 'leads') as SearchLeadsResponse['leads'] };
}

// S1 returns bare arrays for the list endpoints; S3 originally typed them as
// `{ searches: [...] }` / `{ leads: [...] }`. Both shapes are accepted so the
// client tolerates a future server-side switch without another deploy.
function normalizeListBody(body: unknown, wrapperKey: 'searches' | 'leads'): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const wrapped = (body as Record<string, unknown>)[wrapperKey];
    if (Array.isArray(wrapped)) return wrapped;
  }
  return [];
}
