// Shared helpers for Pathfinder token-proxy serverless handlers.
//
// Why this exists: Wave 3 Phase B moved the Pathfinder bearer tokens out of the
// browser bundle (no more `VITE_ARCHITECT_API_TOKEN` / `VITE_SOURCE_ONBOARDER_TOKEN`).
// Each `api/**/_-proxy.ts` route is a thin pass-through that injects the token
// from server-side env, forwards method/body/query, and surfaces upstream
// status + JSON.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export type Upstream = 'architect' | 'sourceOnboarder';

interface ResolvedUpstream {
  baseUrl: string;
  token: string;
}

export class ProxyConfigError extends Error {}

/** Resolve the upstream base URL + token from server-side env. Throws if unset. */
export function resolveUpstream(kind: Upstream): ResolvedUpstream {
  if (kind === 'architect') {
    const baseUrl = process.env.ARCHITECT_API_URL;
    const token = process.env.ARCHITECT_API_TOKEN;
    if (!baseUrl) throw new ProxyConfigError('ARCHITECT_API_URL is not set');
    if (!token) throw new ProxyConfigError('ARCHITECT_API_TOKEN is not set');
    return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
  }
  const baseUrl = process.env.SOURCE_ONBOARDER_URL;
  const token = process.env.SOURCE_ONBOARDER_TOKEN;
  if (!baseUrl) throw new ProxyConfigError('SOURCE_ONBOARDER_URL is not set');
  if (!token) throw new ProxyConfigError('SOURCE_ONBOARDER_TOKEN is not set');
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

/** Best-effort serialization of req.body for forwarding. Vercel parses JSON
 *  bodies to objects; pass through strings/buffers untouched. */
export function serializeBody(req: VercelRequest): string | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (req.body === undefined || req.body === null) return undefined;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf-8');
  return JSON.stringify(req.body);
}

/** Build a `?a=b&c=d` query string from a Vercel-parsed query object,
 *  optionally excluding keys (used to drop URL-route placeholders like `id`). */
export function buildQuery(
  query: VercelRequest['query'],
  exclude: string[] = [],
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (exclude.includes(key)) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface ForwardOptions {
  upstream: Upstream;
  /** Path on upstream API, beginning with `/`. May include placeholder substitutions already. */
  path: string;
  method: string;
  body?: string;
  /** Pass through these query params. Default: all of req.query minus `id`. */
  query?: string;
}

/** Execute a fetch against the resolved upstream, returning the upstream
 *  response. Caller pipes status + JSON body to the client. */
export async function forward(opts: ForwardOptions): Promise<Response> {
  const { baseUrl, token } = resolveUpstream(opts.upstream);
  const url = `${baseUrl}${opts.path}${opts.query ?? ''}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(url, {
    method: opts.method,
    headers,
    body: opts.body,
  });
}

/** Pipe an upstream response through to the Vercel response. Maps non-JSON
 *  bodies to a 502 with a structured error envelope. */
export async function pipe(
  upstream: Response,
  res: VercelResponse,
): Promise<void> {
  const text = await upstream.text();
  res.status(upstream.status);
  // Try JSON pass-through; if upstream returned a non-JSON body, wrap it.
  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || text.length === 0) {
    res.setHeader('content-type', 'application/json');
    res.send(text || '{}');
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.send(JSON.stringify({ ok: false, upstream_status: upstream.status, body: text.slice(0, 1000) }));
}

/** Catch ProxyConfigError → 503 (server misconfigured) and other errors → 502. */
export function handleError(err: unknown, res: VercelResponse): void {
  if (err instanceof ProxyConfigError) {
    res.status(503).json({ ok: false, error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(502).json({ ok: false, error: `upstream fetch failed: ${message}` });
}
