// lib/adapters/sources/ea-forum-rss.ts
//
// EA Forum RSS adapter — Funder onboarding Stage 3.
//
// Endpoint: https://forum.effectivealtruism.org/feed.xml?view=community-top
// Returns the EA Forum's frontpage as Atom-flavored RSS. We parse it as
// a stream of <item> blocks (the feed is small enough that pulling the
// whole document is fine; the EA Forum throttles at ~60 req/min for
// unauth GETs).
//
// What we surface: announcement posts and project-launch posts. The
// qualifier downstream filters to genuine fundable-org launches; this
// adapter's job is to deliver the raw stream.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

const FEED_URL = 'https://forum.effectivealtruism.org/feed.xml';

function extractTag(item: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(item);
  if (!m) return null;
  // Strip CDATA wrappers if present.
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function parseRssItems(xml: string): Array<{ raw: string; data: Record<string, string | null> }> {
  const items: Array<{ raw: string; data: Record<string, string | null> }> = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) != null) {
    const raw = m[0];
    items.push({
      raw,
      data: {
        title: extractTag(raw, 'title'),
        link: extractTag(raw, 'link'),
        guid: extractTag(raw, 'guid'),
        pubDate: extractTag(raw, 'pubDate'),
        creator: extractTag(raw, 'dc:creator') ?? extractTag(raw, 'creator'),
        description: extractTag(raw, 'description'),
      },
    });
  }
  return items;
}

export const eaForumRssAdapter: SourceAdapter = {
  id: 'custom-ea-forum-rss',
  type: 'registered',
  description: 'EA Forum frontpage RSS — announcement / project-launch signal.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const res = await fetchImpl(FEED_URL, {
      headers: {
        Accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Pathfinder/Funder (kyle@freakngenius.com)',
      },
    });
    if (!res.ok) {
      throw new Error(`EA Forum RSS fetch failed: ${res.status}`);
    }
    const xml = await res.text();
    const items = parseRssItems(xml);

    const lookbackSeconds = opts.lookbackSeconds ?? 86_400 * 7; // 7 days default
    const cutoff = Date.now() - lookbackSeconds * 1000;

    const events: SourceEvent[] = [];
    for (const { data, raw } of items) {
      const title = data.title;
      const link = data.link;
      if (!title || !link) continue;

      const pubDate = data.pubDate ? Date.parse(data.pubDate) : NaN;
      const postedAtIso =
        Number.isFinite(pubDate) ? new Date(pubDate).toISOString() : null;
      if (Number.isFinite(pubDate) && pubDate < cutoff) continue;

      const id = `ea-forum:${data.guid ?? link}`;
      events.push({
        source_event_id: id,
        title,
        summary: data.description ?? null,
        posted_date: postedAtIso,
        raw_payload: {
          guid: data.guid,
          link,
          title,
          creator: data.creator,
          pubDate: data.pubDate,
          description: data.description,
          // Trim raw XML to keep raw_payload small.
          item_xml_preview: raw.slice(0, 1000),
        },
      });
    }

    return events;
  },
};
