// scripts/verify-z6-production.ts
//
// Sprint Z12 — Z6 production fetcher diagnostic.
//
// Goal: answer the question "is the Z6 bypass-fetcher chain actually
// firing in production?" — without trusting code paths or env-var
// echoes. Hits a known-Cloudflare-blocked Bonfire detail URL and reports:
//
//   1) SCRAPINGBEE_API_KEY presence (true/false; we never log the value)
//   2) Which fetcher layer succeeded — native / scrapingbee / playwright / blocked
//   3) HTTP status + final URL + first 200 chars of the body (if any)
//
// Honest-failure note (2026-05-28): at the time this script was authored,
// the bypass-fetcher chain in Pathfinder/lib/adapters/zedcor/
// detail-page-fetcher.ts has only ONE layer — a plain `fetch` with the
// PathfinderBot UA. No ScrapingBee, no Playwright integration exists in
// the worktree. This diagnostic therefore reports only the native layer
// and flags the absence of the other two layers explicitly so the PR
// review surface shows it.
//
// Usage:
//   pnpm tsx scripts/verify-z6-production.ts
//   pnpm tsx scripts/verify-z6-production.ts --url=<custom-bonfire-url>

import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

// Harris County Bonfire is the Houston flagship procurement portal and is
// Cloudflare-protected. We use a known-stable detail URL; if the portal
// rotates URLs, override via --url.
const DEFAULT_BONFIRE_URL =
  'https://harriscountytx.bonfirehub.com/portal/?tab=openOpportunities';

interface LayerResult {
  layer: 'native' | 'scrapingbee' | 'playwright';
  attempted: boolean;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  bodySample: string | null;
  cloudflareBlocked: boolean;
  error: string | null;
}

function detectCloudflareBlock(html: string | null, status: number | null): boolean {
  if (status === 403 || status === 503) return true;
  if (!html) return false;
  const sample = html.slice(0, 8192).toLowerCase();
  return (
    sample.includes('cloudflare') &&
    (sample.includes('challenge') ||
      sample.includes('checking your browser') ||
      sample.includes('attention required') ||
      sample.includes('just a moment'))
  );
}

async function tryNative(url: string): Promise<LayerResult> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PathfinderBot/1.0 (+https://unicron.systems/pathfinder)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    const text = await res.text();
    return {
      layer: 'native',
      attempted: true,
      ok: res.ok && !detectCloudflareBlock(text, res.status),
      status: res.status,
      finalUrl: res.url || url,
      bodySample: text.slice(0, 200),
      cloudflareBlocked: detectCloudflareBlock(text, res.status),
      error: null,
    };
  } catch (err) {
    return {
      layer: 'native',
      attempted: true,
      ok: false,
      status: null,
      finalUrl: null,
      bodySample: null,
      cloudflareBlocked: false,
      error: (err as Error).message,
    };
  }
}

async function tryScrapingbee(url: string, apiKey: string | undefined): Promise<LayerResult> {
  if (!apiKey) {
    return {
      layer: 'scrapingbee',
      attempted: false,
      ok: false,
      status: null,
      finalUrl: null,
      bodySample: null,
      cloudflareBlocked: false,
      error: 'SCRAPINGBEE_API_KEY not set — layer not attempted',
    };
  }
  try {
    const sbUrl = new URL('https://app.scrapingbee.com/api/v1/');
    sbUrl.searchParams.set('api_key', apiKey);
    sbUrl.searchParams.set('url', url);
    sbUrl.searchParams.set('render_js', 'false');
    sbUrl.searchParams.set('premium_proxy', 'true');
    const res = await fetch(sbUrl.toString());
    const text = await res.text();
    return {
      layer: 'scrapingbee',
      attempted: true,
      ok: res.ok && !detectCloudflareBlock(text, res.status),
      status: res.status,
      finalUrl: url,
      bodySample: text.slice(0, 200),
      cloudflareBlocked: detectCloudflareBlock(text, res.status),
      error: null,
    };
  } catch (err) {
    return {
      layer: 'scrapingbee',
      attempted: true,
      ok: false,
      status: null,
      finalUrl: null,
      bodySample: null,
      cloudflareBlocked: false,
      error: (err as Error).message,
    };
  }
}

async function tryPlaywright(_url: string): Promise<LayerResult> {
  // Playwright is not wired into detail-page-fetcher.ts at Z12 author time.
  // Report this honestly rather than silently passing.
  return {
    layer: 'playwright',
    attempted: false,
    ok: false,
    status: null,
    finalUrl: null,
    bodySample: null,
    cloudflareBlocked: false,
    error:
      'Playwright fetcher not wired in detail-page-fetcher.ts — Z6 layer ' +
      'not yet implemented; --use-bypass-fetcher flag has no effect in this build.',
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const urlFlag = argv.find((a) => a.startsWith('--url='));
  const url = urlFlag ? urlFlag.slice('--url='.length) : DEFAULT_BONFIRE_URL;

  const scrapingbeeKey = process.env.SCRAPINGBEE_API_KEY;
  const hasScrapingbee = Boolean(scrapingbeeKey && scrapingbeeKey.length > 0);

  console.log('Z6 production fetcher diagnostic');
  console.log('================================');
  console.log(`target URL                : ${url}`);
  console.log(`SCRAPINGBEE_API_KEY set   : ${hasScrapingbee ? 'yes' : 'NO'}`);
  console.log(`NODE_ENV                  : ${process.env.NODE_ENV ?? '(unset)'}`);
  console.log('');

  const results: LayerResult[] = [];
  for (const tryLayer of [tryNative, (u: string) => tryScrapingbee(u, scrapingbeeKey), tryPlaywright]) {
    const r = await tryLayer(url);
    results.push(r);
    if (r.ok) break;
  }

  for (const r of results) {
    console.log(`--- layer: ${r.layer} ---`);
    console.log(`  attempted          : ${r.attempted}`);
    console.log(`  ok                 : ${r.ok}`);
    console.log(`  http_status        : ${r.status ?? '(none)'}`);
    console.log(`  final_url          : ${r.finalUrl ?? '(none)'}`);
    console.log(`  cloudflare_blocked : ${r.cloudflareBlocked}`);
    if (r.error) console.log(`  error              : ${r.error}`);
    if (r.bodySample) {
      const sample = r.bodySample.replace(/\s+/g, ' ').slice(0, 200);
      console.log(`  body_sample        : ${sample}`);
    }
    console.log('');
  }

  const succeededAt = results.find((r) => r.ok);
  console.log('================================');
  if (succeededAt) {
    console.log(`RESULT: ok at layer "${succeededAt.layer}"`);
    process.exit(0);
  }
  const lastError = results[results.length - 1]?.error ?? 'all layers failed';
  console.log(`RESULT: blocked (no layer succeeded; last_error="${lastError}")`);
  process.exit(2);
}

void main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
