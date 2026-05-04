# 2026-05-02 — Pathfinder organization registry table

> **SUPERSEDED 2026-05-04** by `2026-05-04-pathfinder-needs-organizations-schema.md`.
> The newer schema uses uuid PK + separate `slug` and `customer_org_id` columns,
> operator-only RLS (not anon-readable), and adds CRUD endpoints. That doc is
> the active source of truth. Keeping this entry for historical context only.


Discovered during Phase 1 / Stream M3 (Customer List + Health Dashboard) build. The M3 prompt anticipated a multi-tenant view with multiple customer orgs. Reality (verified via `Pathfinder/supabase/migrations/`):

- `pathfinder.customers` exists but holds **facility-level customer records** (30 rows in production), not the tenant orgs of Pathfinder itself.
- Tenant org id is hardcoded as `'zedcor'` across the codebase — no `pathfinder.organizations` table.
- Only one customer (Zedcor) is onboarded at this point in Phase 2.

## What M3 shipped

Single-row Zedcor view in `CustomersView`. The list is computed from a hardcoded `KNOWN_ORGS` array containing just Zedcor for now. Per-org rollups (lead volume, scoring, outreach delivery, errors) read from `pathfinder.*` tables and group by `customer_org_id`.

## What needs to happen (Pathfinder territory — out of scope for any Metacron stream)

When Pathfinder is ready to onboard customer #2, add an `organizations` table:

```sql
create table pathfinder.organizations (
  id text primary key,                 -- slug, e.g. 'zedcor'
  display_name text not null,
  status text not null check (status in ('active', 'onboarding', 'paused')),
  hq_address text,
  primary_contact_email text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table pathfinder.organizations enable row level security;
create policy organizations_read on pathfinder.organizations for select to anon, authenticated using (true);
create policy organizations_write on pathfinder.organizations for all to service_role using (true) with check (true);

insert into pathfinder.organizations (id, display_name, status, onboarded_at)
values ('zedcor', 'Zedcor Security Solutions', 'active', '2026-04-01');
```

Once that lands, M3's `CustomersView` can swap `KNOWN_ORGS` for a Supabase query against `pathfinder.organizations`.

## Acceptance for closing this todo

- `pathfinder.organizations` migration applied to live Supabase.
- M3 `customersClient.listOrgs()` returns the table contents (currently returns `KNOWN_ORGS`).
- Per-org rollups still group correctly by `customer_org_id` (no change required there — the column already exists across `pathfinder.*` tables).
