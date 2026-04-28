-- Realtime: dashboard subscribes to projects (new pin lifecycle) and agent_log (activity rail tail).
-- agent_runs is polled by the agent status row at lower frequency.
alter publication supabase_realtime add table pathfinder.projects;
alter publication supabase_realtime add table pathfinder.agent_log;
alter publication supabase_realtime add table pathfinder.agent_runs;
