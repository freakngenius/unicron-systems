-- Migration: expand email_signups to capture richer landing-page fields
--
-- Context: the new landing page (v8) captures Company Name, Role, First Name,
-- Last Name, Email Address. The old form only captured Name + Email. The
-- public.email_signups table is the dedupe source-of-truth (unique email).
-- This migration adds the four new columns as nullable and drops the
-- NOT NULL constraint on `name` so future inserts can omit it. Existing
-- 18 rows keep their `name` value untouched; the four new columns are NULL
-- for legacy rows. The unique constraint on `email` is preserved.

ALTER TABLE public.email_signups
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text,
  ADD COLUMN IF NOT EXISTS role       text,
  ADD COLUMN IF NOT EXISTS company    text;

ALTER TABLE public.email_signups
  ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN public.email_signups.first_name IS 'First name from v8 landing form';
COMMENT ON COLUMN public.email_signups.last_name  IS 'Last name from v8 landing form';
COMMENT ON COLUMN public.email_signups.role       IS 'Role / title from v8 landing form';
COMMENT ON COLUMN public.email_signups.company    IS 'Company name from v8 landing form';
COMMENT ON COLUMN public.email_signups.name       IS 'Legacy single-name field from pre-v8 landing form. New inserts leave NULL.';
