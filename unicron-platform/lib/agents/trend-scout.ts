// lib/agents/trend-scout.ts — Sprint 7.5 reification
//
// Trend Scout scans public news sources for vertical-relevant signals and
// writes ledger rows + a daily summary to vault. Customer-zero (Zedcor)
// vertical is construction security / mobile solar surveillance.
//
// Reads (public, no API key required):
//   - Hacker News front page (https://hnrss.org/frontpage)
//   - TechCrunch security tag (https://techcrunch.com/category/security/feed/)
// Sink:
//   - nervous_system.ledger rows with source_type='trend_signal' for each
//     vertical-relevant item (dedupe by source_url)
//   - vault file at wiki/memory/trend-scout/<for_date>.md with the top items
//   - audit_log row action='trend_scout_run_complete' with counts
//
// Triggered:
//   - Inngest event 'trend-scout/run' → trendScoutRun
//   - HTTP POST /api/atrium/agents/run/trend-scout

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Zedcor-context keywords. Each match scores +1; ≥1 match = relevant.
// Conservative list — false positives over false negatives is fine because
// Boundary + Kyle review the daily report.
const KEYWORDS = [
  'surveillance', 'security camera', 'cctv', 'site security', 'construction',
  'mobile security', 'solar surveillance', 'jobsite', 'site safety',
  'trespass', 'theft', 'site monitoring', 'remote monitoring', 'edge ai',
  'ai surveillance', 'autonomous security', 'video analytics',
];

interface FeedSource {
  name: string;
  url: string;
}

const FEEDS: FeedSource[] = [
  { name: 'Hacker News front page', url: 'https://hnrss.org/frontpage' },
  { name: 'TechCrunch security', url: 'https://techcrunch.com/category/security/feed/' },
];

interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source_name: string;
}

export interface TrendScoutResult {
  forDate: string;
  vaultPath: string;
  vaultStatus: number;
  feeds_fetched: Array<{ source: string; items: number; error?: string }>;
  relevant_items: number;
  ledger_inserts: Array<{ id: string; source_url: string; title: string; score: number }>;
  audit_log_id: string | null;
}

function parseRssItems(xml: string, source_name: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item[\s\S]*?<\/item>/g;
  const titleRe = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
  const linkRe = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/;
  const dateRe = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const descRe = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/;
  const matches = xml.match(itemRe) ?? [];
  for (const block of matches) {
    const title = block.match(titleRe)?.[1]?.trim();
    const link = block.match(linkRe)?.[1]?.trim();
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: block.match(dateRe)?.[1]?.trim(),
      description: block.match(descRe)?.[1]?.trim().slice(0, 400),
      source_name,
    });
  }
  return items;
}

function scoreItem(item: FeedItem): number {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS) {
    if (text.includes(kw)) score += 1;
  }
  return score;
}

export async function trendScoutRun(opts: { forDate?: string } = {}): Promise<TrendScoutResult> {
  const now = new Date();
  const forDate = opts.forDate ?? now.toISOString().split('T')[0];

  // 1. Fetch each feed
  const feeds_fetched: TrendScoutResult['feeds_fetched'] = [];
  const allItems: FeedItem[] = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'unicron-trend-scout/0.1' } });
      if (!res.ok) {
        feeds_fetched.push({ source: feed.name, items: 0, error: `HTTP ${res.status}` });
        continue;
      }
      const xml = await res.text();
      const items = parseRssItems(xml, feed.name);
      feeds_fetched.push({ source: feed.name, items: items.length });
      allItems.push(...items);
    } catch (err) {
      feeds_fetched.push({ source: feed.name, items: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 2. Score + dedupe by URL
  const scored = allItems
    .map((item) => ({ item, score: scoreItem(item) }))
    .filter((s) => s.score > 0);
  const dedupe = new Map<string, { item: FeedItem; score: number }>();
  for (const s of scored) {
    if (!dedupe.has(s.item.link)) dedupe.set(s.item.link, s);
  }
  const relevant = [...dedupe.values()].sort((a, b) => b.score - a.score);

  // 3. Insert ledger rows (skip if source_url already present)
  const ledger_inserts: TrendScoutResult['ledger_inserts'] = [];
  for (const { item, score } of relevant.slice(0, 25)) {
    // Idempotency check
    const { data: existing } = await supabase
      .schema('nervous_system')
      .from('ledger')
      .select('id')
      .eq('source_url', item.link)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const insert = await supabase
      .schema('nervous_system')
      .from('ledger')
      .insert({
        source_type: 'trend_signal',
        source_url: item.link,
        source_id: `trend_scout::${item.link}`,
        content_summary: item.title,
        content_full: item.description ?? null,
        insights: {
          feed: item.source_name,
          score,
          matched_keywords: KEYWORDS.filter((kw) => `${item.title} ${item.description ?? ''}`.toLowerCase().includes(kw)),
          pub_date: item.pubDate ?? null,
        },
        strength: Math.min(score / 5, 1),
        ttl_days: 30,
      })
      .select('id')
      .single();
    if (insert.error) {
      console.error('[trend-scout] ledger insert:', insert.error.message);
      continue;
    }
    if (insert.data) {
      ledger_inserts.push({ id: insert.data.id as string, source_url: item.link, title: item.title, score });
    }
  }

  // 4. Build vault report
  const lines: string[] = [];
  lines.push(`# Trend Scout — ${forDate}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push('');
  lines.push(`## Feeds fetched`);
  lines.push('');
  for (const f of feeds_fetched) {
    lines.push(`- **${f.source}**: ${f.items} items${f.error ? ` (error: ${f.error})` : ''}`);
  }
  lines.push('');
  lines.push(`## Vertical-relevant signals (${relevant.length} matched · ${ledger_inserts.length} new ledger rows)`);
  lines.push('');
  if (relevant.length === 0) {
    lines.push('_No vertical-relevant items in any fetched feed this run._');
  } else {
    for (const { item, score } of relevant.slice(0, 15)) {
      lines.push(`- [${score}] **[${item.title}](${item.link})** — ${item.source_name}`);
    }
  }
  lines.push('');
  lines.push(`---`);
  lines.push(`_Vertical: construction security / mobile solar surveillance (Zedcor). Keyword list: ${KEYWORDS.join(', ')}_`);

  const reportMd = lines.join('\n');
  const vaultResult = await writeAgentMemory('trend-scout', reportMd, forDate);

  let audit_log_id: string | null = null;
  try {
    const { data: row, error } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'trend_scout_run_complete',
        payload: {
          for_date: forDate,
          vault_path: vaultResult.path,
          vault_status: vaultResult.status,
          feeds_fetched,
          relevant_items: relevant.length,
          ledger_inserts: ledger_inserts.length,
        },
      })
      .select('id')
      .single();
    if (error) console.error('[trend-scout] audit_log:', error.message);
    else if (row) audit_log_id = row.id as string;
  } catch (err) {
    console.error('[trend-scout] audit_log threw:', err instanceof Error ? err.message : err);
  }

  return {
    forDate,
    vaultPath: vaultResult.path,
    vaultStatus: vaultResult.status,
    feeds_fetched,
    relevant_items: relevant.length,
    ledger_inserts,
    audit_log_id,
  };
}
