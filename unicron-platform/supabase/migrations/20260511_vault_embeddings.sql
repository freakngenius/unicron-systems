-- 20260511_vault_embeddings.sql
-- S5c: semantic search over the unicron-knowledge vault.
--
-- Schema design:
--   - nervous_system.vault_embeddings stores one row per .md file in the
--     vault (raw/, wiki/, outputs/) with its embedding vector. The
--     vault-embeddings-rebuild Inngest job pulls files via GITHUB_VAULT_TOKEN
--     and computes embeddings via OpenAI text-embedding-3-small (1536 dims).
--
--   - public.ns_vault_search_by_vector(p_query_embedding, p_limit) returns
--     ranked vault docs by cosine distance. The browser cannot call OpenAI
--     directly (key is server-only), so /api/atrium/vault-search takes a
--     query string, computes the query embedding server-side, then calls
--     this RPC with the resulting vector.
--
-- pgvector 0.8.0 is already installed in the public schema; we reference
-- it without re-creating.

CREATE TABLE IF NOT EXISTS nervous_system.vault_embeddings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path            text NOT NULL UNIQUE,
  content         text NOT NULL,
  content_hash    text NOT NULL,
  embedding       public.vector(1536),
  model           text NOT NULL DEFAULT 'text-embedding-3-small',
  total_bytes     int NOT NULL DEFAULT 0,
  last_commit_sha text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_embeddings_path_idx
  ON nervous_system.vault_embeddings (path);

-- ivfflat with cosine ops — pgvector recommends >= 1000 rows before this
-- index gives meaningful speedup. Below that the planner uses a seq scan
-- anyway, so the index is cheap to keep.
CREATE INDEX IF NOT EXISTS vault_embeddings_embedding_idx
  ON nervous_system.vault_embeddings
  USING ivfflat (embedding public.vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE nervous_system.vault_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vault_embeddings_authenticated_read ON nervous_system.vault_embeddings;
CREATE POLICY vault_embeddings_authenticated_read
  ON nervous_system.vault_embeddings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS vault_embeddings_service_role_write ON nervous_system.vault_embeddings;
CREATE POLICY vault_embeddings_service_role_write
  ON nervous_system.vault_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ns_vault_search_by_vector(
  p_query_embedding public.vector(1536),
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id          uuid,
  path        text,
  content     text,
  similarity  float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    id,
    path,
    LEFT(content, 600) AS content,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM nervous_system.vault_embeddings
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_vault_search_by_vector(public.vector(1536), int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_vault_search_by_vector(public.vector(1536), int) TO authenticated, service_role;
