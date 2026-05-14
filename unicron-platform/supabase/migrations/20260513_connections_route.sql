-- Sprint 8 F4 — Settings → Connections (final applied version)
--
-- Adds last_sync column + 5 OAuth integration rows + ns_list_integration_connections
-- + ns_mark_integration_synced RPCs. Distinguishes operator-OAuth rows from
-- the existing infra/cost vendor rows by category='integration'. Status check
-- constraint widened to accept connected/disconnected/expired alongside the
-- existing healthy/degraded/broken/unknown.

ALTER TABLE nervous_system.connected_services
  ADD COLUMN IF NOT EXISTS last_sync timestamptz;

COMMENT ON COLUMN nervous_system.connected_services.last_sync IS
  'Sprint 8 F4: timestamp of the most recent successful sync/health-check.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='nervous_system.connected_services'::regclass
      AND conname='connected_services_name_unique'
  ) THEN
    ALTER TABLE nervous_system.connected_services
      ADD CONSTRAINT connected_services_name_unique UNIQUE (name);
  END IF;
END $$;

ALTER TABLE nervous_system.connected_services
  DROP CONSTRAINT IF EXISTS connected_services_status_check;
ALTER TABLE nervous_system.connected_services
  ADD CONSTRAINT connected_services_status_check
  CHECK (status = ANY (ARRAY[
    'healthy', 'degraded', 'broken', 'unknown',
    'connected', 'disconnected', 'expired'
  ]));

INSERT INTO nervous_system.connected_services (name, category, status, monthly_cost_usd, notes)
VALUES
  ('Slack OAuth',       'integration', 'disconnected', 0, 'OAuth-based Slack connection for the current operator.'),
  ('Gmail OAuth',       'integration', 'disconnected', 0, 'Per-operator Gmail read/send via Google OAuth.'),
  ('Google Calendar',   'integration', 'disconnected', 0, 'Per-operator Calendar read via Google OAuth.'),
  ('Notion',            'integration', 'disconnected', 0, 'Notion integration token used by the Internal Org Kanban sync.'),
  ('GitHub',            'integration', 'disconnected', 0, 'GitHub Personal Access Token for unicron-knowledge vault writes.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ns_list_integration_connections()
RETURNS TABLE (
  id uuid, name text, status text, last_sync timestamptz, notes text, reconnect_url text, display_order int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT cs.id, cs.name, cs.status, cs.last_sync, cs.notes,
    CASE cs.name
      WHEN 'Slack OAuth'      THEN '/settings/connections/slack/start'
      WHEN 'Gmail OAuth'      THEN '/api/auth/google/start?scope=gmail'
      WHEN 'Google Calendar'  THEN '/api/auth/google/start'
      WHEN 'Notion'           THEN 'https://www.notion.so/my-integrations'
      WHEN 'GitHub'           THEN 'https://github.com/settings/personal-access-tokens'
      ELSE NULL
    END AS reconnect_url,
    CASE cs.name
      WHEN 'Slack OAuth' THEN 1 WHEN 'Gmail OAuth' THEN 2
      WHEN 'Google Calendar' THEN 3 WHEN 'Notion' THEN 4 WHEN 'GitHub' THEN 5
      ELSE 99
    END AS display_order
  FROM nervous_system.connected_services cs
  WHERE cs.category = 'integration'
  ORDER BY display_order ASC, cs.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_integration_connections()
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.ns_mark_integration_synced(p_name text, p_status text DEFAULT 'connected')
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  UPDATE nervous_system.connected_services
     SET last_sync = now(), status = COALESCE(p_status, status)
   WHERE name = p_name AND category = 'integration';
$$;

GRANT EXECUTE ON FUNCTION public.ns_mark_integration_synced(text, text)
  TO authenticated, service_role;
