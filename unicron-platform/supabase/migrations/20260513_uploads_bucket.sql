-- Sprint 8 F1 — Atrium file uploads
--
-- Creates a private 'uploads' Supabase storage bucket + RLS policies allowing
-- any authenticated Atrium operator to upload + read. Atrium is an internal
-- cockpit gated by SSO allowlist (kyle@/keenan@/curtis@/team@unicron.systems —
-- see CLAUDE.md PRODUCTS section), so team-wide read of operator uploads is
-- the explicit default. Per-member restriction can be layered later via a
-- policy override if Kyle decides otherwise.
--
-- Defensible defaults documented for Kyle override:
--   bucket id        : 'uploads'
--   public           : false  (no public CDN; signed URLs only)
--   per-file size    : 25 MB  (enforced client-side; storage has no hard cap here)
--   allowed mime     : pdf / image/* / docx / doc / vtt / srt / txt / md
--   RLS read shape   : team-wide (all authenticated members)

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: any authenticated user can INSERT objects in the bucket
DROP POLICY IF EXISTS uploads_insert_authenticated ON storage.objects;
CREATE POLICY uploads_insert_authenticated ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads');

-- RLS: any authenticated user can SELECT (read) objects in the bucket
DROP POLICY IF EXISTS uploads_select_authenticated ON storage.objects;
CREATE POLICY uploads_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'uploads');

-- RLS: an authenticated user can DELETE their own uploads (owner check via auth.uid())
DROP POLICY IF EXISTS uploads_delete_own ON storage.objects;
CREATE POLICY uploads_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND owner = auth.uid());

-- ─── RPC: ns_log_file_upload ─────────────────────────────────────────────────
-- Called from the client after a successful storage.upload. Writes a
-- nervous_system.ledger row with source_type='file' tying the storage object
-- to operator + mime + size, plus an audit_log row.

CREATE OR REPLACE FUNCTION public.ns_log_file_upload(
  p_storage_path text,
  p_file_url     text,
  p_mime         text,
  p_size_bytes   bigint,
  p_filename     text,
  p_uploaded_by  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_ledger_id uuid;
BEGIN
  v_ledger_id := public.ns_append_ledger_signal(
    p_source_type := 'file',
    p_source_id   := p_storage_path,
    p_summary     := format(
      'File upload: %s (%s, %s bytes)',
      COALESCE(p_filename, p_storage_path),
      COALESCE(p_mime, 'application/octet-stream'),
      COALESCE(p_size_bytes, 0)
    ),
    p_insights    := jsonb_build_object(
      'file_url',     p_file_url,
      'filename',     p_filename,
      'mime',         p_mime,
      'size_bytes',   p_size_bytes,
      'storage_path', p_storage_path,
      'uploaded_by',  p_uploaded_by
    )
  );

  PERFORM public.ns_audit_log_append(
    p_table_name := 'ledger',
    p_action     := 'file_uploaded',
    p_payload    := jsonb_build_object(
      'ledger_id',    v_ledger_id,
      'file_url',     p_file_url,
      'mime',         p_mime,
      'size_bytes',   p_size_bytes,
      'filename',     p_filename,
      'storage_path', p_storage_path,
      'uploaded_by',  p_uploaded_by
    )
  );

  RETURN v_ledger_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_log_file_upload(text, text, text, bigint, text, uuid)
  TO authenticated, anon, service_role;
