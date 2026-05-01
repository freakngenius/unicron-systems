// __tests__/source-onboarder/parse.test.ts
import { describe, expect, it } from 'vitest';
import { parseHtml, parseJson, parseXml } from '@/services/source-onboarder/tools/parse';

describe('parseHtml', () => {
  it('detects React SPA mount node', () => {
    const html = '<!doctype html><html><body><div id="root"></div><script>window.__INITIAL_STATE__={}</script></body></html>';
    const r = parseHtml(html);
    expect(r.hasJsRenderRoot).toBe(true);
  });

  it('detects login form by signal', () => {
    const html = '<html><body><form action="/login"><input type="password"></form></body></html>';
    const r = parseHtml(html);
    expect(r.hasLoginForm).toBe(true);
  });

  it('extracts api candidates and rss link', () => {
    const html = '<html><head><link rel="alternate" type="application/rss+xml" href="https://x/rss"></head><body><a href="/api/v2/items.json">items</a></body></html>';
    const r = parseHtml(html);
    expect(r.schemaHints.apiCandidates).toContain('/api/v2/items.json');
    expect(r.schemaHints.rssCandidates).toContain('https://x/rss');
  });
});

describe('parseJson', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('throws on invalid JSON', () => {
    expect(() => parseJson('not-json')).toThrow();
  });
});

describe('parseXml', () => {
  it('detects RSS root', () => {
    const x = parseXml('<?xml version="1.0"?><rss><channel><item></item></channel></rss>');
    expect(x.isRss).toBe(true);
    expect(x.itemCount).toBe(1);
  });
  it('detects Atom feed', () => {
    const x = parseXml('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry></entry></feed>');
    expect(x.isAtom).toBe(true);
    expect(x.itemCount).toBe(1);
  });
});
