// lib/taboo-keeper.ts — Sprint 1 Stream B
//
// Validates an action against the Unicron taboo list before it executes.
// Fetches Memory/taboos.md from the unicron-knowledge GitHub repo (raw URL),
// caches for 5 minutes, then asks claude-haiku-4-5 for a pass/bounce verdict.
//
// Latency budget: 2 seconds total. If exceeded, returns pass with a warning
// so callers are never blocked by taboo-keeper timeouts.
//
// Logs every call to nervous_system.audit_log (fire-and-forget).

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TabooAction {
  action_type: string;
  target: string;
  payload: unknown;
  requested_by: { type: 'human' | 'agent'; id: string; name: string };
}

export interface TabooVerdict {
  verdict: 'pass' | 'bounce';
  reason?: string;
  matched_taboo?: string;
  warning?: string;
}

// ─── Module-level cache ────────────────────────────────────────────────────

const TABOOS_URL =
  'https://raw.githubusercontent.com/freakngenius/unicron-knowledge/main/Memory/taboos.md';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LATENCY_BUDGET_MS = 2000;
const MODEL = 'claude-haiku-4-5-20251001';

let _tabooCache: { content: string; fetchedAt: number } | null = null;

// Test seam — allow tests to inject a mock fetch or clear cache
let _fetchOverride: ((url: string) => Promise<string>) | null = null;
export function __setFetchOverrideForTests(fn: ((url: string) => Promise<string>) | null): void {
  _fetchOverride = fn;
  _tabooCache = null;
}

let _anthropicOverride: Anthropic | null = null;
export function __setAnthropicForTests(client: Anthropic | null): void {
  _anthropicOverride = client;
}

// ─── Supabase client for audit_log ────────────────────────────────────────

function buildNervousSystemClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    db: { schema: 'nervous_system' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Taboo fetcher ─────────────────────────────────────────────────────────

async function fetchTaboos(): Promise<string> {
  const now = Date.now();
  if (_tabooCache && now - _tabooCache.fetchedAt < CACHE_TTL_MS) {
    return _tabooCache.content;
  }
  const fetcher = _fetchOverride ?? ((url: string) => fetch(url).then((r) => r.text()));
  const content = await fetcher(TABOOS_URL);
  _tabooCache = { content, fetchedAt: now };
  return content;
}

// ─── Audit log (fire-and-forget) ───────────────────────────────────────────

function logAudit(action: TabooAction, verdict: TabooVerdict): void {
  void (async () => {
    try {
      const sb = buildNervousSystemClient();
      if (!sb) return;
      const sbAny = sb as unknown as {
        from: (t: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
        };
      };
      await sbAny.from('audit_log').insert({
        table_name: 'taboo_keeper',
        action: 'validate_action',
        actor_id: action.requested_by.type === 'agent' ? action.requested_by.id : null,
        payload: {
          action_type: action.action_type,
          target: action.target,
          requested_by: action.requested_by,
          verdict: verdict.verdict,
          reason: verdict.reason ?? null,
          matched_taboo: verdict.matched_taboo ?? null,
          warning: verdict.warning ?? null,
        },
      });
    } catch (err) {
      console.error('[taboo-keeper] audit_log write failed (non-fatal)', err);
    }
  })();
}

// ─── System prompt ────────────────────────────────────────────────────────
// Kept under 300 tokens. Model outputs exactly one JSON object.

function buildSystemPrompt(taboos: string): string {
  return `You are the Taboo Keeper. Review actions against the taboo list and respond with a JSON object: {"verdict":"pass"|"bounce","reason":"...","matched_taboo":"..."}.
Only bounce if the action clearly violates a taboo. When in doubt, pass.
Respond with ONLY valid JSON — no markdown, no explanation outside the JSON.

TABOOS:
${taboos.slice(0, 800)}`;
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function validateAction(action: TabooAction): Promise<TabooVerdict> {
  const startedAt = Date.now();

  // Wrap everything in a race against the latency budget
  const result = await Promise.race([
    runValidation(action, startedAt),
    new Promise<TabooVerdict>((resolve) =>
      setTimeout(
        () => resolve({ verdict: 'pass', warning: 'taboo_keeper_timeout' }),
        LATENCY_BUDGET_MS
      )
    ),
  ]);

  logAudit(action, result);
  return result;
}

async function runValidation(action: TabooAction, startedAt: number): Promise<TabooVerdict> {
  try {
    const taboos = await fetchTaboos();
    const elapsed = Date.now() - startedAt;
    if (elapsed >= LATENCY_BUDGET_MS - 200) {
      // Not enough budget left for an LLM call
      return { verdict: 'pass', warning: 'taboo_keeper_timeout' };
    }

    const client =
      _anthropicOverride ??
      (() => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
        return new Anthropic({ apiKey });
      })();

    const userMsg = `Action to evaluate:
action_type: ${action.action_type}
target: ${action.target}
requested_by: ${JSON.stringify(action.requested_by)}
payload summary: ${JSON.stringify(action.payload).slice(0, 300)}`;

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: buildSystemPrompt(taboos),
      messages: [{ role: 'user', content: userMsg }],
    });

    const raw = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    // Parse JSON response; tolerate markdown code fences
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(jsonStr) as {
      verdict?: string;
      reason?: string;
      matched_taboo?: string;
    };

    if (parsed.verdict !== 'pass' && parsed.verdict !== 'bounce') {
      return { verdict: 'pass' };
    }

    return {
      verdict: parsed.verdict,
      reason: parsed.reason,
      matched_taboo: parsed.matched_taboo,
    };
  } catch (err) {
    console.error('[taboo-keeper] validation error (defaulting to pass)', err);
    return { verdict: 'pass', warning: 'taboo_keeper_error' };
  }
}
