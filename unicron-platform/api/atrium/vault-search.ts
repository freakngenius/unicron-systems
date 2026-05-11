// POST /api/atrium/vault-search — S5c
// Body: { query: string, limit?: number }
// Embeds the query via OpenAI text-embedding-3-small (server-side only;
// OPENAI_API_KEY is not exposed to the browser), then calls
// public.ns_vault_search_by_vector to return the top matching vault docs.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { embedQuery } from '../../lib/agents/vault-embeddings.js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { query, limit } = (req.body ?? {}) as { query?: string; limit?: number };
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'query required' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: 'OPENAI_API_KEY not configured on this deployment',
      configured: false,
    });
    return;
  }

  try {
    const queryEmbedding = await embedQuery(query.trim());
    const sb = getServiceClient();
    const { data, error } = await sb.rpc('ns_vault_search_by_vector', {
      p_query_embedding: queryEmbedding,
      p_limit: typeof limit === 'number' && limit > 0 && limit <= 50 ? limit : 10,
    });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ results: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
