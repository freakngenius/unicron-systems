-- Pathfinder lives in its own schema so it doesn't collide with the rest of the unicron-systems project.
create schema if not exists pathfinder;

grant usage on schema pathfinder to anon, authenticated, service_role;
grant all on schema pathfinder to postgres, service_role;

alter default privileges in schema pathfinder
  grant select on tables to anon, authenticated;

alter default privileges in schema pathfinder
  grant all on tables to service_role, postgres;

alter default privileges in schema pathfinder
  grant usage, select on sequences to anon, authenticated;

alter default privileges in schema pathfinder
  grant all on sequences to service_role, postgres;
