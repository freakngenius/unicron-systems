// __tests__/adapters/rss.test.ts — Phase 2 Stream E.
import { describe, expect, it } from 'vitest';
import { parseFeed, rssAdapter } from '@/lib/adapters/rss';

const RSS_2 = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test feed</title>
  <item>
    <guid>abc-1</guid>
    <title>Permit issued at 123 Main</title>
    <link>https://example.gov/permit/abc-1</link>
    <description><![CDATA[Permit description body]]></description>
    <pubDate>Wed, 01 May 2024 14:00:00 GMT</pubDate>
  </item>
  <item>
    <guid>abc-2</guid>
    <title>Permit issued at 456 Oak</title>
    <link>https://example.gov/permit/abc-2</link>
    <pubDate>Wed, 01 May 2024 15:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed</title>
  <entry>
    <id>urn:atom-1</id>
    <title>RFP for HVAC</title>
    <link href="https://x.gov/rfp/1"/>
    <updated>2024-05-01T10:00:00Z</updated>
    <summary>Some summary text</summary>
  </entry>
</feed>`;

describe('rss adapter', () => {
  it('parses RSS 2.0 items', () => {
    const items = parseFeed(RSS_2);
    expect(items).toHaveLength(2);
    expect(items[0].guid).toBe('abc-1');
    expect(items[0].title).toContain('Main');
    expect(items[0].pubDate).toContain('2024');
    expect(items[0].description).toContain('Permit description');
  });

  it('parses Atom entries with link[href]', () => {
    const items = parseFeed(ATOM_FEED);
    expect(items).toHaveLength(1);
    expect(items[0].guid).toBe('urn:atom-1');
    expect(items[0].link).toBe('https://x.gov/rfp/1');
    expect(items[0].pubDate).toContain('2024-05-01');
  });

  it('normalizes RSS item to canonical event with stable id', () => {
    const items = parseFeed(RSS_2);
    const event = rssAdapter.normalize(items[0], { endpoint: 'https://example.gov/rss', jurisdiction: 'CA' });
    expect(event.source_event_id).toBe('abc-1');
    expect(event.source_url).toBe('https://example.gov/permit/abc-1');
    expect(event.timestamp.startsWith('2024-05-01')).toBe(true);
    expect(event.jurisdiction).toBe('CA');
    expect(event.raw_text).toContain('description');
  });
});
