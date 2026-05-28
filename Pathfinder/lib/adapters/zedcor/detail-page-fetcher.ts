// lib/adapters/zedcor/detail-page-fetcher.ts
//
// Sprint Z3.5 — Detail-page fetch utility for GC + contact extraction.
// Sprint Z13 — UPGRADED with 4-layer tiered bypass chain:
//
//   Layer 1 — native fetch (browser UA, 5s timeout). Fastest, free.
//   Layer 2 — ScrapingBee (SCRAPINGBEE_API_KEY, render_js + premium_proxy).
//             Fires when Layer 1 returns 403 or Cloudflare-challenge HTML.
//   Layer 3 — Playwright (@sparticuz/chromium + playwright-core) in a
//             Vercel serverless function with 30s timeout. Used when
//             Layer 2 unavailable (SCRAPINGBEE_API_KEY absent) or fails.
//   Layer 4 — log fetch_status='cloudflare_blocked' with response excerpt,
//             return to caller — never throws. The orchestrator records
//             the failure and continues; downstream waves degrade.
//
// The pre-Z13 single-layer implementation is preserved as the Layer-1
// entry point (fetchNativeOnce) for callers that only want the native
// path (e.g. Socrata JSON sources via data.texas.gov).
//
// Hard rule: this module never persists raw HTML. Callers extract fields
// then discard the body.

import { fetchStrategyFor, isWhitelisted } from './robots-policy';

export type FetchStatus =
  | 'ok'
  | 'gated'
  | 'timeout'
  | 'http_error'
  | 'no_source_url'
  | 'robots_disallowed'
  | 'cloudflare_blocked';

// Sprint Z13 — surfaced on the result so callers can see which layer
// succeeded (or which layer was the last to fail). Persists into
// gc_metadata.fetched_via for the Z6 verify diagnostic.
export type FetchLayer = 'native' | 'scrapingbee' | 'playwright' | 'blocked';

export interface DetailPageFetchResult {
  status: FetchStatus;
  finalUrl: string | null;
  html: string | null;
  httpStatus: number | null;
  fetchedAt: string; // ISO
  // Sprint Z13 — additive fields. Existing callers read .status / .html /
  // .finalUrl / .httpStatus and ignore these; orchestrator wave 2.5 reads
  // them to attribute layer success and log the bypass chain.
  fetchedVia?: FetchLayer;
  layerAttempts?: ReadonlyArray<{
    layer: FetchLayer;
    ok: boolean;
    httpStatus: number | null;
    error: string | null;
  }>;
  cloudflareExcerpt?: string | null;
}

const USER_AGENT = 'PathfinderBot/1.0 (+https://unicron.systems/pathfinder)';
// Sprint Z13 — browser-realistic UA is a separate string. The native
// Layer 1 uses this against Cloudflare-shielded hosts because the
// PathfinderBot/1.0 string trips bot heuristics on most edge networks.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const DEFAULT_TIMEOUT_MS = 5_000;
const PER_HOST_DELAY_MS = 1_500;
const MAX_HTML_BYTES = 2_000_000; // hard cap on memory per fetch; truncate, do not persist.

// Sprint Z13 — Layer 3 (Playwright) takes longer than Layer 1/2 because
// Chromium cold-starts inside a Vercel serverless function. 30s upper
// bound matches the vercel.json maxDuration on the bypass route.
const PLAYWRIGHT_TIMEOUT_MS = 30_000;
const SCRAPINGBEE_TIMEOUT_MS = 25_000;

// Cloudflare-challenge markers. When Layer 1 returns 200 OK with body
// matching these patterns, treat as Layer-1 failure and escalate to
// Layer 2 (ScrapingBee). Sprint Z13.
const CLOUDFLARE_MARKERS: ReadonlyArray<RegExp> = [
  /just\s+a\s+moment/i,
  /attention\s+required/i,
  /cf-(?:browser-verification|challenge|chl)-/i,
  /__cf_chl_(?:jschl_tk|rt_tk|opt)/i,
  /checking\s+your\s+browser\s+before/i,
  /enable\s+(?:javascript|cookies)\s+to\s+continue/i,
  /cloudflare\s+ray\s+id/i,
];

function detectCloudflare(html: string | null, status: number | null): boolean {
  if (status === 403 || status === 503) return true;
  if (!html) return false;
  const sample = html.length > 65_536 ? html.slice(0, 65_536) : html;
  return CLOUDFLARE_MARKERS.some((re) => re.test(sample));
}

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

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z13 — Layer 1 (native fetch)
// ─────────────────────────────────────────────────────────────────────────

interface LayerAttempt {
  layer: FetchLayer;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

interface LayerResult {
  ok: boolean;
  html: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
  cloudflare: boolean;
  error: string | null;
}

async function tryNativeLayer(sourceUrl: string): Promise<LayerResult> {
  let res: Response;
  try {
    // Layer 1 uses the browser-realistic UA. Cloudflare-shielded hosts
    // return 403 for PathfinderBot/1.0 immediately; Safari/17.5 buys
    // them past the bot-heuristic filter on the way to the JS challenge.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      res = await fetch(sourceUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const name = (err as Error & { name?: string }).name ?? '';
    return {
      ok: false,
      html: null,
      httpStatus: null,
      finalUrl: sourceUrl,
      cloudflare: false,
      error: name === 'AbortError' ? 'timeout' : (err as Error).message,
    };
  }

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS * 2));
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      try {
        res = await fetch(sourceUrl, {
          headers: { 'User-Agent': BROWSER_UA },
          redirect: 'follow',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { ok: false, html: null, httpStatus: 429, finalUrl: sourceUrl, cloudflare: false, error: 'retry-after-429-failed' };
    }
  }

  const finalUrl = res.url || sourceUrl;
  if (!res.ok) {
    const cf = detectCloudflare(null, res.status);
    return {
      ok: false,
      html: null,
      httpStatus: res.status,
      finalUrl,
      cloudflare: cf,
      error: `http_${res.status}`,
    };
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
    return { ok: false, html: null, httpStatus: res.status, finalUrl, cloudflare: false, error: 'non_html_content_type' };
  }

  let html: string;
  try {
    html = await readBodyCapped(res);
  } catch {
    return { ok: false, html: null, httpStatus: res.status, finalUrl, cloudflare: false, error: 'body_read_failed' };
  }

  if (detectCloudflare(html, res.status)) {
    return { ok: false, html, httpStatus: res.status, finalUrl, cloudflare: true, error: 'cloudflare_challenge' };
  }

  return { ok: true, html, httpStatus: res.status, finalUrl, cloudflare: false, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z13 — Layer 2 (ScrapingBee bypassFetcher)
// ─────────────────────────────────────────────────────────────────────────

async function tryScrapingbeeLayer(sourceUrl: string): Promise<LayerResult> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return {
      ok: false,
      html: null,
      httpStatus: null,
      finalUrl: sourceUrl,
      cloudflare: false,
      error: 'SCRAPINGBEE_API_KEY_unset',
    };
  }

  const sbUrl = new URL('https://app.scrapingbee.com/api/v1/');
  sbUrl.searchParams.set('api_key', apiKey);
  sbUrl.searchParams.set('url', sourceUrl);
  sbUrl.searchParams.set('render_js', 'true');
  sbUrl.searchParams.set('premium_proxy', 'true');
  sbUrl.searchParams.set('block_resources', 'false');
  sbUrl.searchParams.set('wait', '2000');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPINGBEE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(sbUrl.toString(), { signal: controller.signal });
  } catch (err) {
    const name = (err as Error & { name?: string }).name ?? '';
    return {
      ok: false,
      html: null,
      httpStatus: null,
      finalUrl: sourceUrl,
      cloudflare: false,
      error: name === 'AbortError' ? 'scrapingbee_timeout' : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return {
      ok: false,
      html: null,
      httpStatus: res.status,
      finalUrl: sourceUrl,
      cloudflare: false,
      error: `scrapingbee_http_${res.status}`,
    };
  }

  let html: string;
  try {
    html = await readBodyCapped(res);
  } catch {
    return { ok: false, html: null, httpStatus: res.status, finalUrl: sourceUrl, cloudflare: false, error: 'scrapingbee_body_read_failed' };
  }

  if (detectCloudflare(html, res.status)) {
    return { ok: false, html, httpStatus: res.status, finalUrl: sourceUrl, cloudflare: true, error: 'scrapingbee_returned_challenge' };
  }

  return { ok: true, html, httpStatus: res.status, finalUrl: sourceUrl, cloudflare: false, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z13 — Layer 3 (Playwright via @sparticuz/chromium)
//
// Imports are dynamic + try/catch-wrapped because @sparticuz/chromium
// only resolves cleanly in the Vercel serverless runtime (Linux x64,
// /tmp writable). Local Mac dev + the unicron-platform Vite build don't
// install the chromium binary; in those environments Layer 3 fails fast
// with 'playwright_unavailable' and the chain falls through to Layer 4.
// ─────────────────────────────────────────────────────────────────────────

interface ChromiumLike {
  args: string[];
  executablePath: () => Promise<string>;
}

async function tryPlaywrightLayer(sourceUrl: string): Promise<LayerResult> {
  let chromium: ChromiumLike;
  let playwright: typeof import('playwright-core');
  try {
    // @sparticuz/chromium uses CommonJS `export = Chromium`; under
    // dynamic-import with esModuleInterop the class lands on `.default`,
    // but on some bundlers it's the module object itself. Accept either.
    const sparticuzMod = await import('@sparticuz/chromium');
    const candidate = (sparticuzMod as unknown as { default?: ChromiumLike }).default
      ?? (sparticuzMod as unknown as ChromiumLike);
    chromium = candidate;
    playwright = await import('playwright-core');
  } catch (err) {
    return {
      ok: false,
      html: null,
      httpStatus: null,
      finalUrl: sourceUrl,
      cloudflare: false,
      error: `playwright_unavailable: ${(err as Error).message.slice(0, 200)}`,
    };
  }

  let browser: import('playwright-core').Browser | null = null;
  try {
    const executablePath = await chromium.executablePath();
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
    const ctx = await browser.newContext({ userAgent: BROWSER_UA });
    const page = await ctx.newPage();
    const resp = await page.goto(sourceUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PLAYWRIGHT_TIMEOUT_MS,
    });
    const httpStatus = resp?.status() ?? null;
    const html = await page.content();
    await ctx.close();
    if (detectCloudflare(html, httpStatus)) {
      return { ok: false, html, httpStatus, finalUrl: page.url(), cloudflare: true, error: 'playwright_returned_challenge' };
    }
    return { ok: true, html, httpStatus, finalUrl: page.url(), cloudflare: false, error: null };
  } catch (err) {
    return {
      ok: false,
      html: null,
      httpStatus: null,
      finalUrl: sourceUrl,
      cloudflare: false,
      error: `playwright_error: ${(err as Error).message.slice(0, 200)}`,
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z13 — public entry point with tiered chain
// ─────────────────────────────────────────────────────────────────────────

export interface FetchDetailPageOpts {
  /** When true, force the bypass chain (skip native, start at Layer 2). */
  useBypassFetcher?: boolean;
}

/**
 * Fetch a project detail page through the Z13 tiered chain:
 *   native → ScrapingBee → Playwright → log+continue.
 *
 * Idempotent at the caller level via gc_metadata.fetched_at. Polite
 * per-host throttle and robots-aware (whitelisted hosts under the Z13
 * robots-policy bypass robots.txt entirely).
 *
 * Never throws. On total failure returns
 *   { status: 'cloudflare_blocked', fetchedVia: 'blocked', layerAttempts: [...] }
 * with the per-layer error trail attached.
 */
export async function fetchDetailPage(
  sourceUrl: string | null,
  opts: FetchDetailPageOpts = {},
): Promise<DetailPageFetchResult> {
  const fetchedAt = new Date().toISOString();
  const attempts: LayerAttempt[] = [];

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return { status: 'no_source_url', finalUrl: null, html: null, httpStatus: null, fetchedAt, fetchedVia: 'blocked', layerAttempts: attempts };
  }

  const host = hostOf(sourceUrl);
  if (!host) {
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, fetchedVia: 'blocked', layerAttempts: attempts };
  }

  // Sprint Z13 — whitelisted hosts skip robots.txt enforcement entirely.
  // Everything else falls back to the existing RFC-9309 path.
  if (!isWhitelisted(sourceUrl)) {
    const allowed = await isAllowedByRobots(sourceUrl);
    if (!allowed) {
      return { status: 'robots_disallowed', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, fetchedVia: 'blocked', layerAttempts: attempts };
    }
  }

  await politeDelay(host);

  const strategy = fetchStrategyFor(sourceUrl);

  // Layer 1 — native. Skipped when caller requested bypass, or when the
  // host's strategy is 'bypass' (Cloudflare-shielded by default).
  let nativeRes: LayerResult | null = null;
  if (!opts.useBypassFetcher && strategy !== 'bypass') {
    nativeRes = await tryNativeLayer(sourceUrl);
    attempts.push({ layer: 'native', ok: nativeRes.ok, httpStatus: nativeRes.httpStatus, error: nativeRes.error });
    if (nativeRes.ok) {
      return {
        status: 'ok',
        finalUrl: nativeRes.finalUrl,
        html: nativeRes.html,
        httpStatus: nativeRes.httpStatus,
        fetchedAt,
        fetchedVia: 'native',
        layerAttempts: attempts,
      };
    }
    // Surface native gated/error for native_only sources (no bypass).
    if (strategy === 'native_only') {
      const isGated = nativeRes.httpStatus === 401 || nativeRes.httpStatus === 403;
      return {
        status: isGated ? 'gated' : (nativeRes.error === 'timeout' ? 'timeout' : 'http_error'),
        finalUrl: nativeRes.finalUrl,
        html: null,
        httpStatus: nativeRes.httpStatus,
        fetchedAt,
        fetchedVia: 'native',
        layerAttempts: attempts,
      };
    }
  }

  // Layer 2 — ScrapingBee.
  const sbRes = await tryScrapingbeeLayer(sourceUrl);
  attempts.push({ layer: 'scrapingbee', ok: sbRes.ok, httpStatus: sbRes.httpStatus, error: sbRes.error });
  if (sbRes.ok) {
    return {
      status: 'ok',
      finalUrl: sbRes.finalUrl,
      html: sbRes.html,
      httpStatus: sbRes.httpStatus,
      fetchedAt,
      fetchedVia: 'scrapingbee',
      layerAttempts: attempts,
    };
  }

  // Layer 3 — Playwright.
  const pwRes = await tryPlaywrightLayer(sourceUrl);
  attempts.push({ layer: 'playwright', ok: pwRes.ok, httpStatus: pwRes.httpStatus, error: pwRes.error });
  if (pwRes.ok) {
    return {
      status: 'ok',
      finalUrl: pwRes.finalUrl,
      html: pwRes.html,
      httpStatus: pwRes.httpStatus,
      fetchedAt,
      fetchedVia: 'playwright',
      layerAttempts: attempts,
    };
  }

  // Layer 4 — log + continue.
  const excerpt = (nativeRes?.html ?? sbRes.html ?? pwRes.html ?? '').slice(0, 400) || null;
  return {
    status: 'cloudflare_blocked',
    finalUrl: sourceUrl,
    html: null,
    httpStatus: nativeRes?.httpStatus ?? sbRes.httpStatus ?? pwRes.httpStatus ?? null,
    fetchedAt,
    fetchedVia: 'blocked',
    layerAttempts: attempts,
    cloudflareExcerpt: excerpt,
  };
}

/**
 * Test seam — reset internal per-host throttle + robots cache. Vitest only.
 */
export function __resetDetailPageFetcherState(): void {
  lastHostFetchAt.clear();
  robotsAllowCache.clear();
}
