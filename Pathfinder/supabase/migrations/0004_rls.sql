-- RLS: anon can read everything (the demo is basic-auth gated at the edge),
-- only service_role + the postgres owner can write. The Computer agents' MCP
-- writes use the service role connection scoped to this schema.

alter table pathfinder.branches          enable row level security;
alter table pathfinder.customers         enable row level security;
alter table pathfinder.projects          enable row level security;
alter table pathfinder.agent_log         enable row level security;
alter table pathfinder.agent_runs        enable row level security;
alter table pathfinder.adjacent_targets  enable row level security;

create policy branches_read           on pathfinder.branches          for select to anon, authenticated using (true);
create policy customers_read          on pathfinder.customers         for select to anon, authenticated using (true);
create policy projects_read           on pathfinder.projects          for select to anon, authenticated using (true);
create policy agent_log_read          on pathfinder.agent_log         for select to anon, authenticated using (true);
create policy agent_runs_read         on pathfinder.agent_runs        for select to anon, authenticated using (true);
create policy adjacent_targets_read   on pathfinder.adjacent_targets  for select to anon, authenticated using (true);

-- service_role bypasses RLS by default; explicit policies just make intent explicit.
create policy branches_write          on pathfinder.branches          for all to service_role using (true) with check (true);
create policy customers_write         on pathfinder.customers         for all to service_role using (true) with check (true);
create policy projects_write          on pathfinder.projects          for all to service_role using (true) with check (true);
create policy agent_log_write         on pathfinder.agent_log         for all to service_role using (true) with check (true);
create policy agent_runs_write        on pathfinder.agent_runs        for all to service_role using (true) with check (true);
create policy adjacent_targets_write  on pathfinder.adjacent_targets  for all to service_role using (true) with check (true);
