// lib/agents/action-items-auto-complete.ts — Sprint 8 F5
//
// Hourly cron that scans recent ledger rows (Slack messages, calls, emails,
// voice memos, apple notes, manual entries) and auto-completes open
// action_items when ledger.content_summary contains enough significant tokens
// from the item title to count as a match.
//
// Match heuristic (deliberately conservative — false positives are expensive):
//   1. Tokenize the action item title: lowercase, strip punctuation, drop
//      stopwords + tokens shorter than 3 chars. Keep the unique set.
//   2. Require >=3 significant tokens before the item is eligible (titles
//      shorter than that are too generic to match safely).
//   3. For each candidate ledger row, count how many of the item tokens appear
//      as whole-word matches in the lowercased content_summary.
//   4. Match when overlap >= max(3, ceil(0.6 * |item_tokens|)).
//
// On match: PATCH the row with completed=true, completed_at=now,
// completed_by='auto:<ledger_id>', status='done'. Append nervous_system.audit_log
// row with action='action_item_auto_completed' and the match details.

import { createClient } from '@supabase/supabase-js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'about',
  'have', 'has', 'will', 'are', 'was', 'were', 'been', 'being', 'our', 'your',
  'their', 'them', 'they', 'his', 'her', 'its', 'over', 'under', 'after',
  'before', 'between', 'against', 'during', 'while', 'when', 'then', 'than',
  'because', 'although', 'though', 'just', 'also', 'still', 'very', 'much',
  'more', 'most', 'some', 'any', 'all', 'each', 'every', 'other', 'another',
  'such', 'same', 'own', 'too', 'only', 'not', 'now', 'one', 'two', 'three',
  'who', 'whom', 'whose', 'which', 'what', 'where', 'why', 'how',
  // verbs that show up in every action item — too cheap to discriminate
  'send', 'sent', 'sending', 'make', 'made', 'making', 'get', 'got', 'getting',
  'set', 'setting', 'add', 'added', 'adding', 'do', 'does', 'doing', 'done',
  'follow', 'followup', 'reach', 'reached', 'reaching',
]);

const ELIGIBLE_LEDGER_SOURCE_TYPES = [
  'slack_channel_scan',
  'slack_message',
  'call',
  'voice_memo',
  'email',
  'apple_note',
  'manual',
] as const;

interface OpenActionItemRow {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface LedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
}

interface MatchRecord {
  action_item_id: string;
  ledger_id: string;
  overlap: number;
  required: number;
  matched_tokens: string[];
}

export interface AutoCompleteResult {
  status: 'ok';
  scanned_open_items: number;
  scanned_ledger_rows: number;
  matches: MatchRecord[];
  completed_count: number;
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function makeServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env not configured');
  return createClient(url, key);
}

export async function autoCompleteActionItems(opts?: {
  lookback_hours?: number;
}): Promise<AutoCompleteResult> {
  const sb = makeServiceSupabase();
  const lookback = opts?.lookback_hours ?? 6;
  const cutoff = new Date(Date.now() - lookback * 60 * 60 * 1000).toISOString();

  // ── 1. Pull open action items ──
  const { data: openRows, error: openErr } = await sb
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, description, created_at')
    .eq('completed', false)
    .not('status', 'in', '("done","closed","completed","broken_off")')
    .order('created_at', { ascending: true })
    .limit(200);
  if (openErr) {
    console.error('[auto-complete] open action_items query failed:', openErr.message);
    return { status: 'ok', scanned_open_items: 0, scanned_ledger_rows: 0, matches: [], completed_count: 0 };
  }
  const items = (openRows ?? []) as OpenActionItemRow[];

  // ── 2. Pull recent ledger rows from eligible source_types ──
  const { data: ledgerRows, error: ledgerErr } = await sb
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, created_at')
    .in('source_type', ELIGIBLE_LEDGER_SOURCE_TYPES as unknown as string[])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(500);
  if (ledgerErr) {
    console.error('[auto-complete] ledger query failed:', ledgerErr.message);
  }
  const ledger = (ledgerRows ?? []) as LedgerRow[];

  // ── 3. Score every (item, ledger) pair ──
  const matches: MatchRecord[] = [];
  for (const item of items) {
    const tokens = tokenize(item.title);
    if (tokens.size < 3) continue; // too generic
    const required = Math.max(3, Math.ceil(tokens.size * 0.6));

    let bestLedgerId: string | null = null;
    let bestOverlap = 0;
    let bestMatched: string[] = [];

    for (const row of ledger) {
      const summary = (row.content_summary ?? '').toLowerCase();
      if (!summary) continue;
      let overlap = 0;
      const matchedTokens: string[] = [];
      for (const t of tokens) {
        const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
        if (re.test(summary)) {
          overlap++;
          matchedTokens.push(t);
        }
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestLedgerId = row.id;
        bestMatched = matchedTokens;
      }
    }

    if (bestLedgerId && bestOverlap >= required) {
      matches.push({
        action_item_id: item.id,
        ledger_id: bestLedgerId,
        overlap: bestOverlap,
        required,
        matched_tokens: bestMatched,
      });
    }
  }

  // ── 4. Apply completions ──
  let completedCount = 0;
  const now = new Date().toISOString();
  for (const m of matches) {
    const { error: updErr } = await sb
      .schema('nervous_system')
      .from('action_items')
      .update({
        completed: true,
        completed_at: now,
        completed_by: `auto:${m.ledger_id}`,
        status: 'done',
        last_touched: now,
      })
      .eq('id', m.action_item_id)
      .eq('completed', false); // race-safe: skip if already auto/manual completed
    if (updErr) {
      console.error(`[auto-complete] update ${m.action_item_id} failed:`, updErr.message);
      continue;
    }
    completedCount++;
    // Per-match audit_log row so the Activity Feed shows what fired.
    try {
      await sb.rpc('ns_audit_log_append', {
        p_table_name: 'action_items',
        p_action: 'action_item_auto_completed',
        p_payload: m as unknown as object,
      });
    } catch (err) {
      console.error('[auto-complete] audit_log append failed:', err);
    }
  }

  const result: AutoCompleteResult = {
    status: 'ok',
    scanned_open_items: items.length,
    scanned_ledger_rows: ledger.length,
    matches,
    completed_count: completedCount,
  };

  // Run-level rollup audit_log entry
  try {
    await sb.rpc('ns_audit_log_append', {
      p_table_name: 'action_items',
      p_action: 'auto_complete_run',
      p_payload: {
        scanned_open_items: items.length,
        scanned_ledger_rows: ledger.length,
        match_count: matches.length,
        completed_count: completedCount,
        lookback_hours: lookback,
      } as unknown as object,
    });
  } catch (err) {
    console.error('[auto-complete] rollup audit_log append failed:', err);
  }

  console.log(
    `[auto-complete] scanned ${items.length} open items × ${ledger.length} ledger rows → ${matches.length} matches → ${completedCount} completed`
  );
  return result;
}
