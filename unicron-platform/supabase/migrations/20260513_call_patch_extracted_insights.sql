-- 20260513_call_patch_extracted_insights.sql
--
-- Goal "Fix Atrium call upload end-to-end": the pipeline needs to MERGE the
-- extracted key_takeaways + insights into the call ledger row's `insights`
-- jsonb column without clobbering existing keys (notion_url, participants,
-- mentioned_customers, etc.). Direct UPDATE … SET insights = '{...}' would
-- overwrite the whole object.
--
-- Additive.

CREATE OR REPLACE FUNCTION public.ns_call_patch_extracted_insights(
  p_call_id            uuid,
  p_key_takeaways      jsonb DEFAULT '[]'::jsonb,
  p_extracted_insights jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  UPDATE nervous_system.ledger
  SET insights = coalesce(insights, '{}'::jsonb)
              || jsonb_build_object(
                   'key_takeaways',      coalesce(p_key_takeaways, '[]'::jsonb),
                   'extracted_insights', coalesce(p_extracted_insights, '[]'::jsonb)
                 )
  WHERE id = p_call_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_call_patch_extracted_insights(uuid, jsonb, jsonb)
  TO authenticated, anon, service_role;
