// api/skills/search.ts — Sprint 9 Stream B
//
// POST /api/skills/search — hybrid FTS + vector search with Reciprocal
// Rank Fusion (Addendum 5 §7).
//
// Body:
//   { query: string, customer_id?: string|null, limit?: number }
//
// Pipeline:
//   1. Embed the query via OpenAI text-embedding-3-small (existing
//      lib/agents/vault-embeddings.ts).
//   2. Vector top-K 20 against nervous_system.skills.embedding via the
//      ns_skills_search_by_vector RPC (provided by Stream A migration).
//   3. FTS top-K 20 against nervous_system.skills.fts via the
//      ns_skills_search_by_fts RPC (provided by Stream A migration).
//   4. RRF fuse both ranked lists with k=60.
//   5. Filter by lifecycle_status='approved', status != 'deprecated',
//      customer_id RLS scope, and decay_at > now() OR decay_at IS NULL.
//   6. Hydrate full Skill rows for the top fused ids.
//
// Graceful degradation: if the embedding call fails (e.g. OPENAI_API_KEY
// missing, or vector index not yet backfilled), fall back to FTS-only
// and surface a `debug.embedding_degraded` flag.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSkillsAuth } from '../../lib/skills/auth.js';
import { getSkillsServiceClient, skillsTable } from '../../lib/skills/supabase.js';
import { reciprocalRankFuse, type RankedItem } from '../../lib/skills/rrf.js';
import { embedQuery } from '../../lib/agents/vault-embeddings.js';

const TOP_K = 20;
const SELECT_COLS =
  'id,name,description,domain,type,inputs_schema,outputs_schema,schedule_cron,trigger_event,' +
  'refusal_gate,budget_usd_per_run,active,status,run_endpoint,repo,skill_md_path,' +
  'lifecycle_status,version,parent_skill_id,author_kind,author_id,approved_by,approved_at,' +
  'taboo_check_id,run_count,success_count,last_run_at,decay_at,customer_id,evidence,' +
  'created_at,updated_at';

interface SearchBody {
  query?: string;
  customer_id?: string | null;
  limit?: number;
}

interface RankedRpcRow {
  id: string;
  rank?: number;
  score?: number;
}

async function ftsRanked(
  sb: SupabaseClient,
  query: string,
  customerId: string | null | undefined,
): Promise<{ rows: RankedItem[]; error?: string }> {
  const { data, error } = await sb.rpc('ns_skills_search_by_fts', {
    p_query: query,
    p_customer_id: customerId ?? null,
    p_limit: TOP_K,
  });
  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []) as RankedRpcRow[];
  return { rows: rows.map((r) => ({ id: r.id })) };
}

async function vectorRanked(
  sb: SupabaseClient,
  embedding: number[],
  customerId: string | null | undefined,
): Promise<{ rows: RankedItem[]; error?: string }> {
  const { data, error } = await sb.rpc('ns_skills_search_by_vector', {
    p_query_embedding: embedding,
    p_customer_id: customerId ?? null,
    p_limit: TOP_K,
  });
  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []) as RankedRpcRow[];
  return { rows: rows.map((r) => ({ id: r.id })) };
}

async function hydrate(
  sb: SupabaseClient,
  ids: string[],
  customerId: string | null | undefined,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const nowIso = new Date().toISOString();
  let q = skillsTable(sb)
    .select(SELECT_COLS)
    .in('id', ids)
    .eq('lifecycle_status', 'approved')
    .neq('status', 'deprecated')
    .or(`decay_at.is.null,decay_at.gt.${nowIso}`);

  if (customerId === null || customerId === undefined) {
    // No tenant — system Skills only.
    q = q.is('customer_id', null);
  } else if (customerId === 'null') {
    q = q.is('customer_id', null);
  } else {
    q = q.or(`customer_id.is.null,customer_id.eq.${customerId}`);
  }

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-unicron-api-key');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const auth = await checkSkillsAuth(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const body = (req.body ?? {}) as SearchBody;
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length === 0) {
    res.status(400).json({ ok: false, error: 'query is required' });
    return;
  }
  const customerId =
    body.customer_id === null
      ? null
      : typeof body.customer_id === 'string'
      ? body.customer_id
      : undefined;
  const limit = (() => {
    const n = typeof body.limit === 'number' ? body.limit : TOP_K;
    if (!Number.isFinite(n) || n <= 0) return TOP_K;
    return Math.min(Math.floor(n), 50);
  })();

  let sb: SupabaseClient;
  try {
    sb = getSkillsServiceClient();
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  // FTS branch — mandatory.
  const fts = await ftsRanked(sb, query, customerId);
  if (fts.error) {
    res.status(500).json({ ok: false, error: `fts: ${fts.error}` });
    return;
  }

  // Vector branch — graceful degradation.
  let vector: { rows: RankedItem[]; error?: string };
  let embeddingDegraded = false;
  let embeddingDegradedReason: string | undefined;
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    const queryEmbedding = await embedQuery(query);
    vector = await vectorRanked(sb, queryEmbedding, customerId);
    if (vector.error) {
      embeddingDegraded = true;
      embeddingDegradedReason = vector.error;
      vector = { rows: [] };
    }
  } catch (err) {
    embeddingDegraded = true;
    embeddingDegradedReason = err instanceof Error ? err.message : String(err);
    vector = { rows: [] };
  }

  const fused = reciprocalRankFuse({ fts: fts.rows, vector: vector.rows });
  const topIds = fused.slice(0, limit).map((r) => r.id);
  const hydrated = await hydrate(sb, topIds, customerId);
  const byId = new Map(hydrated.map((s) => [(s as { id: string }).id, s]));

  const results = fused
    .map((r) => {
      const skill = byId.get(r.id);
      if (!skill) return null;
      return {
        skill,
        rrf_score: r.rrf_score,
        fts_rank: r.fts_rank,
        vector_rank: r.vector_rank,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, limit);

  res.status(200).json({
    ok: true,
    query,
    customer_id: customerId ?? null,
    results,
    debug: {
      fts_candidates: fts.rows.length,
      vector_candidates: vector.rows.length,
      fused_candidates: fused.length,
      embedding_degraded: embeddingDegraded,
      ...(embeddingDegradedReason
        ? { embedding_degraded_reason: embeddingDegradedReason }
        : {}),
    },
  });
}
