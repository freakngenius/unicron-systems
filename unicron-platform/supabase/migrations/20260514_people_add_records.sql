-- 20260514_people_add_records.sql
--
-- Goal "Atrium People → wire context-aware Add buttons" (2026-05-14):
-- four tab-specific Add modals (Customer / Team member / Network contact /
-- Applicant) need INSERT RPCs. Two of the underlying tables don't exist
-- yet (network_contacts, hiring_candidates) — created additively here.
--
-- Additive only. Existing `customers` and `team_members` tables are untouched
-- aside from new RPCs that wrap inserts.

-- ─── Tables (additive) ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nervous_system.network_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  email        text,
  company      text,
  role         text,
  relationship text,
  notes        text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_contacts_name_idx ON nervous_system.network_contacts (lower(name));

CREATE TABLE IF NOT EXISTS nervous_system.hiring_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text,
  role_applying   text,
  source          text,
  status          text NOT NULL DEFAULT 'applied'
                    CHECK (status IN ('applied','screening','interview','offer','hired','rejected','withdrawn')),
  notes           text,
  resume_url      text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hiring_candidates_status_idx ON nervous_system.hiring_candidates (status, created_at DESC);

-- ─── Counts (Atrium board-count sidebar) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_network_contacts()
RETURNS int LANGUAGE sql SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$ SELECT count(*)::int FROM nervous_system.network_contacts; $$;

CREATE OR REPLACE FUNCTION public.ns_count_hiring_candidates()
RETURNS int LANGUAGE sql SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$ SELECT count(*)::int FROM nervous_system.hiring_candidates; $$;

GRANT EXECUTE ON FUNCTION public.ns_count_network_contacts()  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ns_count_hiring_candidates() TO authenticated, anon, service_role;

-- ─── Insert RPCs ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_create_customer(
  p_name      text,
  p_stage     text DEFAULT NULL,
  p_status    text DEFAULT 'active',
  p_arr_usd   numeric DEFAULT NULL,
  p_notes     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  INSERT INTO nervous_system.customers (name, stage, status, arr_usd, notes)
  VALUES (trim(p_name), p_stage, COALESCE(p_status,'active'), p_arr_usd, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ns_create_team_member(
  p_name             text,
  p_email            text DEFAULT NULL,
  p_role             text DEFAULT NULL,
  p_slack_user_id    text DEFAULT NULL,
  p_github_username  text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  INSERT INTO nervous_system.team_members (name, email, role, slack_user_id, github_username, active)
  VALUES (trim(p_name), nullif(trim(coalesce(p_email,'')),''), p_role,
          nullif(trim(coalesce(p_slack_user_id,'')),''),
          nullif(trim(coalesce(p_github_username,'')),''),
          true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ns_create_network_contact(
  p_name          text,
  p_email         text DEFAULT NULL,
  p_company       text DEFAULT NULL,
  p_role          text DEFAULT NULL,
  p_relationship  text DEFAULT NULL,
  p_notes         text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  INSERT INTO nervous_system.network_contacts (name, email, company, role, relationship, notes)
  VALUES (trim(p_name),
          nullif(trim(coalesce(p_email,'')),''),
          nullif(trim(coalesce(p_company,'')),''),
          nullif(trim(coalesce(p_role,'')),''),
          nullif(trim(coalesce(p_relationship,'')),''),
          p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ns_create_hiring_candidate(
  p_name           text,
  p_email          text DEFAULT NULL,
  p_role_applying  text DEFAULT NULL,
  p_source         text DEFAULT NULL,
  p_status         text DEFAULT 'applied',
  p_notes          text DEFAULT NULL,
  p_resume_url     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  INSERT INTO nervous_system.hiring_candidates (name, email, role_applying, source, status, notes, resume_url)
  VALUES (trim(p_name),
          nullif(trim(coalesce(p_email,'')),''),
          nullif(trim(coalesce(p_role_applying,'')),''),
          nullif(trim(coalesce(p_source,'')),''),
          COALESCE(p_status,'applied'),
          p_notes,
          nullif(trim(coalesce(p_resume_url,'')),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ns_create_customer(text, text, text, numeric, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ns_create_team_member(text, text, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ns_create_network_contact(text, text, text, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ns_create_hiring_candidate(text, text, text, text, text, text, text)
  TO authenticated, service_role;
