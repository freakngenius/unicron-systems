// lib/adapters/rss.ts — Tier 1 RSS / Atom feed adapter.
//
// Lightweight regex-based parser to keep the dep surface zero-add. This is
// safe because RSS/Atom are well-behaved XML in practice and we only extract
// 5 fields per item. If a feed is sufficiently malformed that the regex
// approach fails, the onboarder's runTestFetch + iterate-3-times loop will
// catch it and route to a human-assist ticket.

import type { Adapter, AdapterRuntimeConfig, NormalizedEvent } from './types';
import { validateNormalizedEvent } from './socrata';

export interface RssRecord {
  guid?: string;
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  raw: string;
}

const ITEM_RE = /<item[\s>][\s\S]*?<\/item>/gi;
const ENTRY_RE = /<entry[\s>][\s\S]*?<\/entry>/gi;

function tag(block: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  if (!m) return undefined;
  const text = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return text === '' ? undefined : text;
}

function attr(block: string, name: string, attr: string): string | undefined {
  const re = new RegExp(`<${name}\\b[^>]*\\b${attr}=\"([^\"]+)\"`, 'i');
  const m = block.match(re);
  return m ? m[1] : undefined;
}

export function parseFeed(xml: string): RssRecord[] {
  const items: RssRecord[] = [];
  const useEntries = !ITEM_RE.test(xml) && /<entry[\s>]/i.test(xml);
  ITEM_RE.lastIndex = 0;
  ENTRY_RE.lastIndex = 0;
  const re = useEntries ? ENTRY_RE : ITEM_RE;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const item: RssRecord = {
      guid: tag(block, 'guid') ?? tag(block, 'id'),
      title: tag(block, 'title'),
      link: tag(block, 'link') ?? attr(block, 'link', 'href'),
      description: tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content'),
      pubDate: tag(block, 'pubDate') ?? tag(block, 'updated') ?? tag(block, 'published'),
      raw: block,
    };
    items.push(item);
  }
  return items;
}

export const rssAdapter: Adapter<RssRecord> = {
  kind: 'rss',

  async poll(config) {
    const headers: Record<string, string> = {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      'User-Agent': 'Unicron-SourceOnboarder/0.1 (+https://unicron.systems)',
      ...(config.headers ?? {}),
    };
    const res = await fetch(config.endpoint, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      throw new Error(`rss fetch failed status=${res.status} body=${text.slice(0, 200)}`);
    }
    const xml = await res.text();
    return parseFeed(xml);
  },

  normalize(raw, config) {
    const ts =
      raw.pubDate && Number.isFinite(Date.parse(raw.pubDate))
        ? new Date(raw.pubDate).toISOString()
        : new Date().toISOString();
    return {
      source_event_id: raw.guid ?? raw.link ?? `${raw.title ?? 'untitled'}::${ts}`,
      timestamp: ts,
      source_url: raw.link ?? config.endpoint,
      jurisdiction: config.jurisdiction ?? 'unknown',
      raw_text: raw.description ?? raw.title ?? undefined,
      metadata: { ...raw, raw: undefined },
    } as NormalizedEvent;
  },

  validate(event) {
    return validateNormalizedEvent(event);
  },
};
