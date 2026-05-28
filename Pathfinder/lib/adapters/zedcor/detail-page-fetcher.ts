// lib/adapters/zedcor/detail-page-fetcher.ts
//
// Sprint Z3.5 — Detail-page fetch utility for GC + contact extraction.
//
// One fetch per project per orchestrator run. The caller (gc-extractor)
// records `fetched_at` into gc_metadata so re-runs short-circuit. This
// module is responsible solely for fetching HTML safely:
//
//   - 5s per-request timeout
//   - 1.5s polite delay between fetches per source host
//   - UA: PathfinderBot/1.0 (+https://unicron.systems/pathfinder)
//   - 429 → exponential backoff (single retry)
//   - robots.txt awareness (best-effort per host; cached for the run)
//   - "gated" detection (login walls / paywalls returning HTML 200s)
//
// Hard rule: this module never persists raw HTML. Callers extract fields
// then discard the body.

export type FetchStatus =
  | 'ok'
  | 'gated'
  | 'timeout'
  | 'http_error'
  | 'no_source_url'
  | 'robots_disallowed';

export interface DetailPageFetchResult {
  status: FetchStatus;
  finalUrl: string | null;
  html: string | null;
  httpStatus: number | null;
  fetchedAt: string; // ISO
}

const USER_AGENT = 'PathfinderBot/1.0 (+https://unicron.systems/pathfinder)';
const DEFAULT_TIMEOUT_MS = 5_000;
const PER_HOST_DELAY_MS = 1_500;
const MAX_HTML_BYTES = 2_000_000; // hard cap on memory per fetch; truncate, do not persist.

const GATED_MARKERS: ReadonlyArray<RegExp> = [
  /please\s+(sign|log)\s*in/i,
  /login\s+required/i,
  /<form[^>]*\b(login|signin|sign-in)\b/i,
  /<input[^>]*type=["']password["']/i,
  /authentication\s+required/i,
  /your\s+session\s+has\s+expired/i,
];

// Per-process state, intentionally minimal. The orchestrator + backfill
// are single-process; sharing one rate-limit map is correct here.
const lastHostFetchAt = new Map<string, number>();
const robotsAllowCache = new Map<string, boolean>();

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function politeDelay(host: string): Promise<void> {
  const last = lastHostFetchAt.get(host) ?? 0;
  const elapsed = Date.now() - last;
  const wait = PER_HOST_DELAY_MS - elapsed;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHostFetchAt.set(host, Date.now());
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    return await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let out = '';
  while (received < MAX_HTML_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= MAX_HTML_BYTES) break;
  }
  out += decoder.decode();
  try {
    await reader.cancel();
  } catch {
    // ignore — body already drained
  }
  return out;
}

function detectGated(html: string): boolean {
  // Cheap heuristic: scan a 64KB window. Gated pages typically surface
  // these markers in the visible markup; deeper SPA-rendered walls fall
  // through and the extraction layer returns null fields.
  const sample = html.length > 65_536 ? html.slice(0, 65_536) : html;
  return GATED_MARKERS.some((re) => re.test(sample));
}

async function isAllowedByRobots(url: string): Promise<boolean> {
  const host = hostOf(url);
  if (!host) return true;
  const cached = robotsAllowCache.get(host);
  if (cached !== undefined) return cached;

  const robotsUrl = `${new URL(url).protocol}//${host}/robots.txt`;
  try {
    const res = await fetchWithTimeout(robotsUrl, 3_000);
    if (!res.ok) {
      // 404 / 5xx on robots.txt → permissive default per RFC 9309.
      robotsAllowCache.set(host, true);
      return true;
    }
    const body = await res.text();
    const allowed = !isPathDisallowed(body, new URL(url).pathname);
    robotsAllowCache.set(host, allowed);
    return allowed;
  } catch {
    robotsAllowCache.set(host, true);
    return true;
  }
}

function isPathDisallowed(robotsBody: string, path: string): boolean {
  // Minimal parser: walk record blocks, find any matching our UA (or '*'),
  // then test Disallow patterns. Allow lines override longer-match Disallow.
  const lines = robotsBody.split(/\r?\n/);
  type Record = { agents: string[]; rules: Array<{ kind: 'allow' | 'disallow'; pattern: string }> };
  const records: Record[] = [];
  let current: Record | null = null;
  let inAgentBlock = false;

  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) {
      inAgentBlock = false;
      continue;
    }
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!inAgentBlock || !current) {
        current = { agents: [val], rules: [] };
        records.push(current);
        inAgentBlock = true;
      } else {
        current.agents.push(val);
      }
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) {
        current = { agents: ['*'], rules: [] };
        records.push(current);
      }
      inAgentBlock = false;
      current.rules.push({ kind: key, pattern: val });
    }
  }

  const matching = records.filter((r) =>
    r.agents.some((a) => a === '*' || a.toLowerCase() === 'pathfinderbot'),
  );
  if (matching.length === 0) return false;

  // Longest-match wins per RFC 9309 §2.2.2.
  let verdict: 'allow' | 'disallow' | null = null;
  let bestLen = -1;
  for (const r of matching) {
    for (const rule of r.rules) {
      if (rule.pattern === '') {
        // empty Disallow means "allow all"; empty Allow is meaningless.
        if (rule.kind === 'disallow' && bestLen < 0) verdict = 'allow';
        continue;
      }
      if (matchesPattern(rule.pattern, path) && rule.pattern.length > bestLen) {
        verdict = rule.kind;
        bestLen = rule.pattern.length;
      }
    }
  }
  return verdict === 'disallow';
}

function matchesPattern(pattern: string, path: string): boolean {
  // robots.txt supports '*' (any seq) and '$' (end-anchor). Build a regex.
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '.*';
    else if (c === '$' && i === pattern.length - 1) re += '$';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  try {
    return new RegExp(re).test(path);
  } catch {
    return false;
  }
}

/**
 * Fetch a project detail page with the policies above. Idempotent at the
 * caller level via gc_metadata.fetched_at — this function does not cache
 * across calls beyond the polite per-host throttle.
 */
export async function fetchDetailPage(sourceUrl: string | null): Promise<DetailPageFetchResult> {
  const fetchedAt = new Date().toISOString();

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return { status: 'no_source_url', finalUrl: null, html: null, httpStatus: null, fetchedAt };
  }

  const host = hostOf(sourceUrl);
  if (!host) {
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt };
  }

  const allowed = await isAllowedByRobots(sourceUrl);
  if (!allowed) {
    return { status: 'robots_disallowed', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt };
  }

  await politeDelay(host);

  let res: Response;
  try {
    res = await fetchWithTimeout(sourceUrl, DEFAULT_TIMEOUT_MS);
  } catch (err) {
    const name = (err as Error & { name?: string }).name ?? '';
    if (name === 'AbortError') {
      return { status: 'timeout', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt };
    }
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt };
  }

  if (res.status === 429) {
    // Single backoff retry per spec (exponential = 2x polite delay).
    await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS * 2));
    try {
      res = await fetchWithTimeout(sourceUrl, DEFAULT_TIMEOUT_MS);
    } catch {
      return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: 429, fetchedAt };
    }
  }

  const finalUrl = res.url || sourceUrl;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { status: 'gated', finalUrl, html: null, httpStatus: res.status, fetchedAt };
    }
    return { status: 'http_error', finalUrl, html: null, httpStatus: res.status, fetchedAt };
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
    return { status: 'http_error', finalUrl, html: null, httpStatus: res.status, fetchedAt };
  }

  let html: string;
  try {
    html = await readBodyCapped(res);
  } catch {
    return { status: 'http_error', finalUrl, html: null, httpStatus: res.status, fetchedAt };
  }

  if (detectGated(html)) {
    return { status: 'gated', finalUrl, html: null, httpStatus: res.status, fetchedAt };
  }

  return { status: 'ok', finalUrl, html, httpStatus: res.status, fetchedAt };
}

/**
 * Test seam — reset internal per-host throttle + robots cache. Vitest only.
 */
export function __resetDetailPageFetcherState(): void {
  lastHostFetchAt.clear();
  robotsAllowCache.clear();
}
