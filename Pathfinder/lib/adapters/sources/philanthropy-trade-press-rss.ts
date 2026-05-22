// lib/adapters/sources/philanthropy-trade-press-rss.ts
//
// Philanthropy trade-press RSS aggregator — Funder onboarding Stage 3.
//
// Pulls a configurable list of philanthropy-vertical RSS feeds and emits
// one event per entry. Default feeds are Chronicle of Philanthropy and
// Inside Philanthropy. Philanthropy News Digest was retired from defaults
// 2026-05-22 — Candid (PND's parent) migrated /news/rss.xml to /blogs/
// and stopped publishing an RSS endpoint; operator can re-add if a working
// URL emerges.
//
// Status: 'registered'. Each feed failure is logged but does not fail the
// whole adapter — the aggregator returns whatever feeds responded.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.
// Live-verified 2026-05-22.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

const DEFAULT_FEEDS: Array<{ name: string; url: string }> = [
  { name: 'Chronicle of Philanthropy', url: 'https://www.philanthropy.com/feed/' },
  { name: 'Inside Philanthropy', url: 'https://www.insidephilanthropy.com/feed' },
];

function extractTag(item: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(item);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function parseItems(xml: string): Array<Record<string, string | null>> {
  const items: Array<Record<string, string | null>> = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) != null) {
    const raw = m[0];
    items.push({
      title: extractTag(raw, 'title'),
      link: extractTag(raw, 'link'),
      guid: extractTag(raw, 'guid'),
      pubDate: extractTag(raw, 'pubDate'),
      description: extractTag(raw, 'description'),
    });
  }
  return items;
}

export const philanthropyTradePressRssAdapter: SourceAdapter = {
  id: 'custom-philanthropy-trade-press-rss',
  type: 'registered',
  description: 'Aggregator over philanthropy trade-press RSS feeds (Chronicle of Philanthropy, Inside Philanthropy). PND was retired 2026-05-22 — Candid stopped publishing RSS.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const feedsCfg = (opts.config?.feeds ?? null) as Array<{ name: string; url: string }> | null;
    const feeds = feedsCfg && Array.isArray(feedsCfg) && feedsCfg.length > 0 ? feedsCfg : DEFAULT_FEEDS;

    const lookbackSeconds = opts.lookbackSeconds ?? 86_400 * 7;
    const cutoff = Date.now() - lookbackSeconds * 1000;

    const events: SourceEvent[] = [];
    for (const feed of feeds) {
      let xml: string;
      try {
        const res = await fetchImpl(feed.url, {
          headers: { Accept: 'application/rss+xml,application/xml;q=0.9', 'User-Agent': 'Pathfinder/Funder' },
        });
        if (!res.ok) {
          console.error(`[philanthropy-rss] ${feed.name} fetch failed: ${res.status}`);
          continue;
        }
        xml = await res.text();
      } catch (err) {
        console.error(`[philanthropy-rss] ${feed.name} network error:`, err instanceof Error ? err.message : err);
        continue;
      }
      const items = parseItems(xml);
      for (const item of items) {
        const title = item.title;
        const link = item.link;
        if (!title || !link) continue;
        const pubDate = item.pubDate ? Date.parse(item.pubDate) : NaN;
        if (Number.isFinite(pubDate) && pubDate < cutoff) continue;
        events.push({
          source_event_id: `philanthropy-rss:${item.guid ?? link}`,
          title,
          summary: item.description ?? null,
          posted_date: Number.isFinite(pubDate) ? new Date(pubDate).toISOString() : null,
          raw_payload: {
            outlet: feed.name,
            feed_url: feed.url,
            link,
            guid: item.guid,
            pubDate: item.pubDate,
            description: item.description,
          },
        });
      }
    }

    return events;
  },
};
