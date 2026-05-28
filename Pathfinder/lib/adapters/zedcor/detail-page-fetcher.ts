// lib/adapters/zedcor/detail-page-fetcher.ts
//
// Sprint Z6 — Cloudflare/robots bypass upgrade.
//
// Tiered fallback strategy for whitelisted procurement portals (Bonfire,
// IonWave, Workday, DemandStar, etc. — see ./robots-policy.ts):
//
//   Layer 1: native fetch with browser User-Agent. Try first, fastest, free.
//   Layer 2: ScrapingBee proxy (render_js=true, premium_proxy=true) if
//            SCRAPINGBEE_API_KEY env var is present.
//   Layer 3: Playwright headless Chromium via @sparticuz/chromium +
//            playwright-core if the modules are installed at runtime.
//   Layer 4: All three fail → return fetch_status='cloudflare_blocked' with
//            a short response excerpt. Caller continues; no halt.
//
// For non-whitelisted domains: Layer 1 only, robots.txt honored as before.
//
// Hard rule: this module never persists raw HTML beyond the return value.
// Callers extract fields then discard the body.

import { policyForUrl, ROBOTS_POLICY_VERSION, type DomainPolicy } from './robots-policy';

export type FetchStatus =
  | 'ok'
  | 'gated'
  | 'timeout'
  | 'http_error'
  | 'no_source_url'
  | 'robots_disallowed'
  | 'cloudflare_blocked';

export type FetchLayer = 'l1_native' | 'l2_scrapingbee' | 'l3_playwright' | 'none';

export interface DetailPageFetchResult {
  status: FetchStatus;
  finalUrl: string | null;
  html: string | null;
  httpStatus: number | null;
  fetchedAt: string; // ISO
  /** Which fetch layer produced this result (Z6+). */
  layer?: FetchLayer;
  /** Short response excerpt for cloudflare_blocked diagnostics (Z6+). */
  blockedExcerpt?: string | null;
  /** robots policy version that resolved this URL's strategy (Z6+). */
  policyVersion?: string;
}

export interface FetchDetailPageOptions {
  /**
   * Force the tiered bypass strategy for this URL even if the domain isn't
   * in the whitelist. Used by --use-bypass-fetcher backfills and by tests.
   */
  forceBypass?: boolean;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PATHFINDER_UA = 'PathfinderBot/1.0 (+https://unicron.systems/pathfinder)';
const DEFAULT_TIMEOUT_MS = 8_000;
const SCRAPINGBEE_TIMEOUT_MS = 25_000;
const PLAYWRIGHT_TIMEOUT_MS = 30_000;
const PER_HOST_DELAY_MS = 1_500;
const MAX_HTML_BYTES = 2_000_000;
const BLOCKED_EXCERPT_CHARS = 600;

const GATED_MARKERS: ReadonlyArray<RegExp> = [
  /please\s+(sign|log)\s*in/i,
  /login\s+required/i,
  /<form[^>]*\b(login|signin|sign-in)\b/i,
  /<input[^>]*type=["']password["']/i,
  /authentication\s+required/i,
  /your\s+session\s+has\s+expired/i,
];

const CLOUDFLARE_MARKERS: ReadonlyArray<RegExp> = [
  /cloudflare/i,
  /<title>[^<]*Just a moment/i,
  /<title>[^<]*Attention Required/i,
  /cf-chl-bypass/i,
  /cf-browser-verification/i,
  /Checking your browser before accessing/i,
  /Enable JavaScript and cookies to continue/i,
  /Performance &amp;? Security by Cloudflare/i,
];

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

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
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
  const sample = html.length > 65_536 ? html.slice(0, 65_536) : html;
  return GATED_MARKERS.some((re) => re.test(sample));
}

function detectCloudflare(html: string | null, httpStatus: number | null): boolean {
  if (httpStatus === 403 || httpStatus === 503) {
    if (!html) return true;
  }
  if (!html) return false;
  const sample = html.length > 65_536 ? html.slice(0, 65_536) : html;
  return CLOUDFLARE_MARKERS.some((re) => re.test(sample));
}

function excerptForLogging(html: string | null): string | null {
  if (!html) return null;
  return html.slice(0, BLOCKED_EXCERPT_CHARS).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Robots — preserved verbatim from Z3.5 with a whitelist short-circuit.
// ---------------------------------------------------------------------------

async function isAllowedByRobots(url: string): Promise<boolean> {
  const host = hostOf(url);
  if (!host) return true;
  const cached = robotsAllowCache.get(host);
  if (cached !== undefined) return cached;

  const robotsUrl = `${new URL(url).protocol}//${host}/robots.txt`;
  try {
    const res = await fetchWithTimeout(robotsUrl, 3_000, PATHFINDER_UA);
    if (!res.ok) {
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

  let verdict: 'allow' | 'disallow' | null = null;
  let bestLen = -1;
  for (const r of matching) {
    for (const rule of r.rules) {
      if (rule.pattern === '') {
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

// ---------------------------------------------------------------------------
// Layer 1 — native fetch with browser UA
// ---------------------------------------------------------------------------

async function tryLayer1Native(
  sourceUrl: string,
  userAgent: string,
  fetchedAt: string,
): Promise<DetailPageFetchResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(sourceUrl, DEFAULT_TIMEOUT_MS, userAgent);
  } catch (err) {
    const name = (err as Error & { name?: string }).name ?? '';
    if (name === 'AbortError') {
      return { status: 'timeout', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'l1_native' };
    }
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'l1_native' };
  }

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS * 2));
    try {
      res = await fetchWithTimeout(sourceUrl, DEFAULT_TIMEOUT_MS, userAgent);
    } catch {
      return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: 429, fetchedAt, layer: 'l1_native' };
    }
  }

  const finalUrl = res.url || sourceUrl;
  if (!res.ok) {
    // 403/503: read a short body to check for Cloudflare HTML
    let bodyExcerpt: string | null = null;
    try {
      const body = await res.text();
      bodyExcerpt = body.slice(0, MAX_HTML_BYTES);
    } catch {
      // ignore
    }
    if (detectCloudflare(bodyExcerpt, res.status)) {
      return {
        status: 'cloudflare_blocked',
        finalUrl,
        html: null,
        httpStatus: res.status,
        fetchedAt,
        layer: 'l1_native',
        blockedExcerpt: excerptForLogging(bodyExcerpt),
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: 'gated', finalUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l1_native' };
    }
    return { status: 'http_error', finalUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l1_native' };
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
    return { status: 'http_error', finalUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l1_native' };
  }

  let html: string;
  try {
    html = await readBodyCapped(res);
  } catch {
    return { status: 'http_error', finalUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l1_native' };
  }

  if (detectCloudflare(html, res.status)) {
    return {
      status: 'cloudflare_blocked',
      finalUrl,
      html: null,
      httpStatus: res.status,
      fetchedAt,
      layer: 'l1_native',
      blockedExcerpt: excerptForLogging(html),
    };
  }

  if (detectGated(html)) {
    return { status: 'gated', finalUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l1_native' };
  }

  return { status: 'ok', finalUrl, html, httpStatus: res.status, fetchedAt, layer: 'l1_native' };
}

// ---------------------------------------------------------------------------
// Layer 2 — ScrapingBee proxy
// ---------------------------------------------------------------------------

async function tryLayer2ScrapingBee(
  sourceUrl: string,
  fetchedAt: string,
): Promise<DetailPageFetchResult | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key: apiKey,
    url: sourceUrl,
    render_js: 'true',
    premium_proxy: 'true',
    block_resources: 'false',
    country_code: 'us',
  });
  const endpoint = `https://app.scrapingbee.com/api/v1/?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPINGBEE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
  } catch (err) {
    const name = (err as Error & { name?: string }).name ?? '';
    if (name === 'AbortError') {
      return { status: 'timeout', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'l2_scrapingbee' };
    }
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'l2_scrapingbee' };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l2_scrapingbee' };
  }

  let html: string;
  try {
    html = await readBodyCapped(res);
  } catch {
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l2_scrapingbee' };
  }

  if (detectGated(html)) {
    return { status: 'gated', finalUrl: sourceUrl, html: null, httpStatus: res.status, fetchedAt, layer: 'l2_scrapingbee' };
  }

  // ScrapingBee occasionally returns a 200 + cloudflare challenge page when
  // the proxy IP is itself blocked; treat that as cloudflare_blocked.
  if (detectCloudflare(html, res.status)) {
    return {
      status: 'cloudflare_blocked',
      finalUrl: sourceUrl,
      html: null,
      httpStatus: res.status,
      fetchedAt,
      layer: 'l2_scrapingbee',
      blockedExcerpt: excerptForLogging(html),
    };
  }

  return { status: 'ok', finalUrl: sourceUrl, html, httpStatus: res.status, fetchedAt, layer: 'l2_scrapingbee' };
}

// ---------------------------------------------------------------------------
// Layer 3 — Playwright (headless Chromium via @sparticuz/chromium)
//
// We dynamically import so absence of the optional dep doesn't break the
// non-bypass code path or local tests. On Vercel we expect the module to
// resolve; locally a developer who hasn't run `pnpm install` will simply
// fall through to L4.
// ---------------------------------------------------------------------------

async function tryLayer3Playwright(
  sourceUrl: string,
  fetchedAt: string,
): Promise<DetailPageFetchResult | null> {
  type ChromiumModule = {
    executablePath: () => Promise<string>;
    args: string[];
    headless: boolean;
  };
  let chromium: ChromiumModule | null = null;
  let playwright: typeof import('playwright-core') | null = null;
  try {
    const chromiumMod = (await import('@sparticuz/chromium')) as unknown as
      ChromiumModule & { default?: ChromiumModule };
    chromium = chromiumMod.default ?? chromiumMod;
    playwright = (await import('playwright-core')) as typeof import('playwright-core');
  } catch {
    // Modules not installed; signal "no Layer 3 available" to caller.
    return null;
  }
  if (!chromium || !playwright) return null;

  let browser: import('playwright-core').Browser | null = null;
  try {
    const execPath = await chromium.executablePath();
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: execPath,
      headless: true,
    });
    const ctx = await browser.newContext({ userAgent: BROWSER_UA });
    const page = await ctx.newPage();
    await page.goto(sourceUrl, { timeout: PLAYWRIGHT_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    // Give Cloudflare a beat to clear if it's a JS challenge.
    await page.waitForTimeout(2_500);
    const html = await page.content();
    const finalUrl = page.url();
    await ctx.close();

    if (detectCloudflare(html, null)) {
      return {
        status: 'cloudflare_blocked',
        finalUrl,
        html: null,
        httpStatus: null,
        fetchedAt,
        layer: 'l3_playwright',
        blockedExcerpt: excerptForLogging(html),
      };
    }
    if (detectGated(html)) {
      return { status: 'gated', finalUrl, html: null, httpStatus: null, fetchedAt, layer: 'l3_playwright' };
    }
    const capped = html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html;
    return { status: 'ok', finalUrl, html: capped, httpStatus: 200, fetchedAt, layer: 'l3_playwright' };
  } catch (err) {
    const name = (err as Error & { name?: string }).name ?? '';
    if (name === 'TimeoutError') {
      return { status: 'timeout', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'l3_playwright' };
    }
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'l3_playwright' };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Fetch a project detail page with tiered fallback. Idempotent at the
 * caller level via gc_metadata.fetched_at — this function does not cache
 * across calls beyond the polite per-host throttle.
 *
 * Z6 changes:
 *  - Honors per-domain whitelist from robots-policy.ts
 *  - Browser UA + tiered L1→L4 fallback for whitelisted hosts
 *  - Non-whitelisted hosts: Layer 1 only, robots honored (Z3.5 behavior)
 */
export async function fetchDetailPage(
  sourceUrl: string | null,
  options: FetchDetailPageOptions = {},
): Promise<DetailPageFetchResult> {
  const fetchedAt = new Date().toISOString();

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return { status: 'no_source_url', finalUrl: null, html: null, httpStatus: null, fetchedAt, layer: 'none' };
  }

  const host = hostOf(sourceUrl);
  if (!host) {
    return { status: 'http_error', finalUrl: sourceUrl, html: null, httpStatus: null, fetchedAt, layer: 'none' };
  }

  const policy: DomainPolicy = policyForUrl(sourceUrl);
  const useBypass = options.forceBypass || policy.bypassRobots;

  if (!policy.bypassRobots && !options.forceBypass) {
    const allowed = await isAllowedByRobots(sourceUrl);
    if (!allowed) {
      return {
        status: 'robots_disallowed',
        finalUrl: sourceUrl,
        html: null,
        httpStatus: null,
        fetchedAt,
        layer: 'none',
        policyVersion: ROBOTS_POLICY_VERSION,
      };
    }
  }

  await politeDelay(host);

  // Layer 1
  const l1 = await tryLayer1Native(sourceUrl, useBypass ? BROWSER_UA : PATHFINDER_UA, fetchedAt);
  l1.policyVersion = ROBOTS_POLICY_VERSION;
  if (l1.status === 'ok' || !useBypass) {
    return l1;
  }
  // Only escalate to L2/L3 on cloudflare_blocked, gated (sometimes JS-rendered
  // wall), or 5xx-ish http_error. Timeouts at L1 also escalate — they often
  // indicate a JS challenge dropping the connection.
  const shouldEscalate =
    l1.status === 'cloudflare_blocked' ||
    l1.status === 'gated' ||
    l1.status === 'timeout' ||
    l1.status === 'http_error';
  if (!shouldEscalate) return l1;

  // Layer 2 — ScrapingBee (only if key present)
  const l2 = await tryLayer2ScrapingBee(sourceUrl, fetchedAt);
  if (l2) {
    l2.policyVersion = ROBOTS_POLICY_VERSION;
    if (l2.status === 'ok') return l2;
  }

  // Layer 3 — Playwright (only if modules available)
  const l3 = await tryLayer3Playwright(sourceUrl, fetchedAt);
  if (l3) {
    l3.policyVersion = ROBOTS_POLICY_VERSION;
    if (l3.status === 'ok') return l3;
  }

  // Layer 4 — cloudflare_blocked or whatever the last attempted layer returned.
  const final = l3 ?? l2 ?? l1;
  if (final.status !== 'cloudflare_blocked' && final.status !== 'ok') {
    // Preserve the most informative blocked excerpt if any layer captured one.
    const blockedExcerpt = l3?.blockedExcerpt ?? l2?.blockedExcerpt ?? l1.blockedExcerpt ?? null;
    return {
      status: 'cloudflare_blocked',
      finalUrl: sourceUrl,
      html: null,
      httpStatus: final.httpStatus,
      fetchedAt,
      layer: final.layer ?? 'none',
      blockedExcerpt,
      policyVersion: ROBOTS_POLICY_VERSION,
    };
  }
  return final;
}

/**
 * Test seam — reset internal per-host throttle + robots cache. Vitest only.
 */
export function __resetDetailPageFetcherState(): void {
  lastHostFetchAt.clear();
  robotsAllowCache.clear();
}

/** Re-export for callers that want to introspect policy decisions. */
export { policyForUrl };
