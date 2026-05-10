# SPEC — Phase 2A: Multi-tenant Routing & Operator-Only Auth

**Updated 2026-05-05.** Customer-facing magic-link flow removed per Kyle's direction. Metacron + per-customer Pathfinder views are internal operator tools only. No customer logs in.

## What ships

1. Slug routing on Pathfinder: `pathfinder-ashy.vercel.app/[slug]` resolves to operator-scoped per-org dashboard.
2. Operator-only auth via Supabase Auth allowlist: kyle@, keenan@, curtis@, team@unicron.systems, plus invited operator emails.
3. RLS scoping all customer-data tables to organization_id; operator session token grants read across all orgs.
4. 404 on invalid slug, 403 if operator email not in allowlist.
5. Zedcor migration: existing dashboard moves from hardcoded paths to `/zedcor` slug. Zedcor becomes first org row.
6. Metacron Customers tab deep-link button: "Open Pathfinder for [Customer]" routes to `/[slug]` with operator session intact.

## Schema

### `pathfinder.org_memberships` (new, simplified)

```sql
CREATE TABLE pathfinder.org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES pathfinder.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('operator','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
```

Only `operator` and `admin` roles. No customer role since customers don't log in. The membership table primarily exists to control which operator emails are allowed which orgs (future per-org operator routing — for now all internal operators see all orgs).

### Operator allowlist enforcement

```sql
CREATE TABLE pathfinder.operator_allowlist (
  email text PRIMARY KEY,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('operator','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pathfinder.operator_allowlist (email, role) VALUES
  ('kyle@unicron.systems', 'admin'),
  ('keenan@unicron.systems', 'admin'),
  ('curtis@unicron.systems', 'admin'),
  ('team@unicron.systems', 'operator');
```

Auth callback rejects sign-in if email not in allowlist.

### Customer-data tables get organization_id RLS

For every customer-readable table (`pathfinder.leads`, `agent_verifications`, etc.):
1. Add `organization_id uuid` column if missing.
2. Backfill with Zedcor's org_id.
3. Enable RLS.
4. Policy: operators (allowlist auth) read all orgs; service role full access.

```sql
CREATE POLICY "operators read all org data"
  ON pathfinder.<table> FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pathfinder.operator_allowlist
      WHERE email = auth.jwt() ->> 'email'
    )
  );
```

## Routing

```
Pathfinder/app/
├── [slug]/
│   ├── layout.tsx       # OrgContext provider, fetch org, validate operator session
│   ├── page.tsx         # Dashboard
│   ├── leads/
│   ├── pipeline/
│   ├── activity/
│   └── settings/
├── login/page.tsx       # Operator email entry → Supabase Auth (allowlist-checked)
├── auth/callback/route.ts  # Allowlist enforcement; reject non-operator emails
└── not-found.tsx        # Branded 404
```

`[slug]/layout.tsx` flow:
1. Read `slug` from params.
2. Fetch org from `pathfinder.organizations`. 404 if missing.
3. Validate operator session via Supabase Auth cookie.
4. Verify operator email in `operator_allowlist`. 403 if not.
5. Render `OrgContext.Provider` with org + architecture JSON.

Root `/` redirect:
- Operator session → operator picker view (list of all orgs)
- No session → `/login`

## Login flow (operator-only)

1. Operator visits `/login`, enters email.
2. Supabase Auth `signInWithOtp({ email })` sends magic link to operator email.
3. Operator clicks link, callback handler validates against `operator_allowlist`.
4. If valid, session set, redirected to `/`. If not, 403 + clear error.

## Metacron deep-link

Each org row in Metacron Customers tab gets "Open Pathfinder for [name]" button. Routes to `https://pathfinder.unicron.systems/[slug]` carrying operator session via Supabase Auth shared cookie domain.

## Acceptance criteria

- `/realberry` resolves for operator, shows Realberry org data.
- `/zedcor` resolves; existing data flows unchanged.
- `/nonexistent` → 404.
- Non-allowlist email → callback returns 403.
- "Open Pathfinder for X" deep-links correctly.
- RLS verified: customer-side queries (no operator JWT) cannot read customer-data tables.

## Out of scope (was in original spec, dropped)

- Customer-facing magic-link flow
- Customer membership creation
- Customer login UX
- Customer email validation
- `customer` role in org_memberships

## Dependencies

- `pathfinder.organizations` table (peer dependency)
- Supabase Auth project with magic-link enabled (operator emails only)

End.
