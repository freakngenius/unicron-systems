-- Post-demo Gate 4 — recorder ↔ session telemetry linkage.
--
-- pathfinder.llm_calls.session_id has been written for months but had no
-- foreign-key constraint enforcing it points at a real architect_sessions
-- row. Adding the FK guards against silent drift (typo'd session ids,
-- session row deleted while llm_calls remain) and lets PostgREST surface
-- session→llm_calls joins without a custom view.
--
-- Additive only. ON DELETE SET NULL preserves observability data when
-- sessions get cleaned up — llm_calls rows survive with session_id=null.

-- Validate-then-add: any pre-existing llm_calls.session_id values that
-- don't match an architect_sessions.id get nulled first so the FK
-- create doesn't fail. The only orphaned rows we expect are from test
-- fixtures and the 4-row architect-tuning + 3-row coverage-expansion
-- batches; both wrote session_ids that DO match real sessions.
update pathfinder.llm_calls
set session_id = null
where session_id is not null
  and not exists (
    select 1
    from pathfinder.architect_sessions s
    where s.id = pathfinder.llm_calls.session_id
  );

alter table pathfinder.llm_calls
  add constraint llm_calls_session_id_fkey
  foreign key (session_id)
  references pathfinder.architect_sessions(id)
  on delete set null;

create index if not exists llm_calls_session_id_idx
  on pathfinder.llm_calls (session_id)
  where session_id is not null;

comment on constraint llm_calls_session_id_fkey on pathfinder.llm_calls is
  'Post-demo Gate 4 — telemetry linkage. SET NULL on delete preserves observability when sessions are cleaned up.';
