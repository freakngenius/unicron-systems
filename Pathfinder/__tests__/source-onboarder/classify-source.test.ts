// __tests__/source-onboarder/classify-source.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { classifySource } from '@/services/source-onboarder/tools/classify-source';

afterEach(() => vi.restoreAllMocks());

function stubFetch(opts: { status?: number; contentType?: string; body: string }) {
  // @ts-expect-error stub
  global.fetch = vi.fn(async () => ({
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    headers: new Headers({ 'content-type': opts.contentType ?? 'text/plain' }),
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { value: undefined, done: true };
            sent = true;
            return { value: new TextEncoder().encode(opts.body), done: false };
          },
          cancel() {},
        };
      },
    },
    text: async () => opts.body,
    redirected: false,
    url: 'https://example/',
  }));
}

describe('classifySource', () => {
  it('returns hint when provided', async () => {
    const r = await classifySource('https://anything', { hint: 'rss' });
    expect(r.classification.kind).toBe('rss');
  });

  it('classifies Socrata resource path by URL pattern', async () => {
    const r = await classifySource('https://data.cityofnewyork.us/resource/abcd-efgh.json');
    expect(r.classification.kind).toBe('socrata');
  });

  it('classifies RSS via XML body', async () => {
    stubFetch({ contentType: 'application/rss+xml', body: '<?xml version="1.0"?><rss><channel><item/></channel></rss>' });
    const r = await classifySource('https://x.gov/feed');
    expect(r.classification.kind).toBe('rss');
  });

  it('routes JS-rendered SPA to tier_2', async () => {
    stubFetch({ contentType: 'text/html', body: '<!doctype html><html><body><div id="__next"></div></body></html>' });
    const r = await classifySource('https://nyc.gov/permits');
    expect(r.classification.kind).toBe('tier_2');
    if (r.classification.kind === 'tier_2') {
      expect(r.classification.reason).toBe('js_rendering');
    }
  });

  it('routes 401 to tier_2 auth_required', async () => {
    stubFetch({ status: 401, contentType: 'text/plain', body: 'auth required' });
    const r = await classifySource('https://api.private.gov/data');
    expect(r.classification.kind).toBe('tier_2');
    if (r.classification.kind === 'tier_2') {
      expect(r.classification.reason).toBe('auth_required');
    }
  });

  it('routes pdf content-type to tier_2 pdf_inconsistent', async () => {
    stubFetch({ contentType: 'application/pdf', body: '%PDF-1.4' });
    const r = await classifySource('https://county.gov/recorder/dailyfiles');
    expect(r.classification.kind).toBe('tier_2');
    if (r.classification.kind === 'tier_2') {
      expect(r.classification.reason).toBe('pdf_inconsistent');
    }
  });

  it('routes paid keyword to tier_3', async () => {
    stubFetch({ contentType: 'text/html', body: '<html>This data requires a paid subscription</html>' });
    const r = await classifySource('https://construct-pro.com/leads');
    expect(r.classification.kind).toBe('tier_3');
  });

  it('classifies bare JSON array dump', async () => {
    stubFetch({ contentType: 'application/json', body: '[{"id":1},{"id":2}]' });
    const r = await classifySource('https://x.gov/static/dump.json');
    expect(r.classification.kind).toBe('json-dump');
  });
});
