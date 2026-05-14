# SPEC Addendum 7 - Programmatic Tool Calling (`execute_skill`)

**Status:** Draft for engineer + Master Conductor handoff
**Parent SPECs:** SPEC - Unicron Nervous System.md, Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md
**Depends on:** Addendum 5 (Procedural Memory Layer), Addendum 6 (Skill Forge Agent)
**Companions:** Addendum 4 (Scenarios + Satisfaction + DTU), Pathfinder Phase 2 PRD
**Date:** 2026-05-14
**Owner:** Kyle Kesterson
**Parent PRD:** PRD - Procedural Memory & Skill Forge.md

`execute_skill` replaces multi-hop tool chains in the Slack Orchestrator and the Pathfinder agent fleet with a single inference that emits one `execute_skill` call. The Skill's `code_body` (if present) or its SKILL.md recipe (if not) runs sandboxed in an Inngest step. Output returns to the caller as a single tool result.

This collapses the Pathfinder Ingestor, Verifier, Enricher, AdjacencyMapper chain from 4 to 9 inference calls per lead down to 1 plus the Skill body. Target: 5 to 10x token compression, p50 latency under 15 minutes.

Merge into the parent SPEC's agent runtime section at v0.6 after Sprint 11 ships.

---

## 1. Tool definition

Exposed to the Orchestrator and to specialist agents that opt in. Registered in the existing Slack Orchestrator tool registry.

```json
{
  "name": "execute_skill",
  "description": "Run a procedural-memory Skill. Use when a known Skill matches the task. Do not synthesize what already exists.",
  "input_schema": {
    "type": "object",
    "required": ["skill_name", "inputs"],
    "properties": {
      "skill_name": { "type": "string" },
      "skill_version": { "type": "integer" },
      "inputs": { "type": "object" },
      "customer_id": { "type": "string", "format": "uuid" }
    }
  }
}
```

The original PRD draft used `skill_slug`. The live table keys on `name`. Use `skill_name`.

---

## 2. Execution path

1. Resolve `skill_name` plus optional `skill_version` (default is the highest-version row with `lifecycle_status = 'approved'`) against `nervous_system.skills` with the caller's tenant scope applied.
2. Validate `inputs` against the Skill's `inputs_schema`. Reject on mismatch.
3. Call Taboo Keeper with `{action: 'invoke_skill', skill_id, inputs, caller}`. Reject if refused.
4. If `code_body` is present:
   a. Run the static-analysis gate (section 3). Reject on any violation.
   b. Spawn an Inngest step with the code body, the inputs, and a scoped Supabase client (RLS already applied to the tenant).
   c. Time out at the Skill-declared `max_runtime_ms`, default 60s.
5. If only the SKILL.md recipe is present: run the Orchestrator's existing step interpreter over the recipe. This primitive already exists; reuse it.
6. Validate the output against the Skill's `outputs_schema`. Reject on mismatch.
7. Persist a `nervous_system.skill_invocations` row with cost, latency, status, and the Inngest run id.
8. Return the validated output as the single tool result.

---

## 3. Static-analysis gate

Before any `code_body` runs, a Python AST walker rejects:

- Any import outside an allowlist. `requests` is permitted only via the platform HTTP client. No `subprocess`, no `os.system`, no `eval`, no `exec`.
- Any network call not routed through the platform HTTP client.
- Any database access not routed through the scoped Supabase client.
- Any filesystem write outside `/tmp/skill_run/`.
- Any `while True` without a max-iteration guard.

If a Skill's `code_body` changes between versions, the AST diff of the new version is what Taboo Keeper reviews, not the natural-language description. This is what makes "the refusal layer is structural code" honest at the Skill level. It composes with the Addendum 5 write trigger: a code-body change is a version bump, the version bump is a write, the write needs a `taboo_check_id`.

---

## 4. Sandbox

- Default: Inngest `step.run` with an isolated worker process, no shared memory, no shared filesystem.
- **Sprint 11 day-1 spike (mandatory).** Confirm Inngest's isolation is sufficient for arbitrary `code_body` execution. Record the decision in the Sprint 11 sprint card body and the PR description with verbatim evidence.
- Fallback if the spike fails: spawn each `code_body` into a dedicated Vercel function with no cross-tenant secrets, called via a signed URL.
- No Modal or Daytona introduction unless the spike concludes both Inngest and the Vercel fallback are insufficient. Stay on the existing stack. If both are insufficient, that is a critical halt and escalates to Kyle.

---

## 5. Caller-facing contract

The Orchestrator's system prompt gets a new section:

> When a task matches a known Skill, prefer `execute_skill` over re-synthesizing the chain. Search Skills first via `search_skills`. Synthesizing a chain that duplicates an approved Skill is a smell. Note it so Skill Forge can refine.

Pathfinder specialist agents (Ingestor, Verifier, Enricher, AdjacencyMapper, Outreach Drafter) each get a pre-step: try `search_skills` plus `execute_skill` first, fall back to the current hard-coded chain only on a no-match. This is the migration path, not a rewrite. The old chain stays as the fallback until skill coverage is proven.

---

## 6. Acceptance scenarios (Addendum 4 style)

Stored at `vault/wiki/scenarios/execute-skill/`. Satisfaction threshold 0.90 (this surface touches production lead data and customer-facing pipelines, so the threshold is tighter than the 0.85 default).

- **S7.1** A Pathfinder Ingestor task that previously took 4 hops resolves in 1 `execute_skill` call when a matching Skill exists.
- **S7.2** Static analysis rejects a `code_body` containing `subprocess` before it is callable.
- **S7.3** A Skill invocation that exceeds `max_runtime_ms` is killed cleanly and logged as `status = 'failed'`.
- **S7.4** A Skill invocation against another tenant's data is refused at RLS, not at Taboo Keeper (defense in depth: both layers hold).
- **S7.5** The Slack Orchestrator's average tokens-per-task drops by >= 50% on tasks that hit an existing Skill.
- **S7.6** A new Skill version's code diff is shown to the human approver before promotion.
- **S7.7** The Pathfinder pipeline p50 latency on the Zedcor lead volume is under 15 minutes after migration.

---

## 7. What this addendum does NOT do

- It does not author the Skills that Pathfinder agents will invoke. Sprint 11 hand-seeds 5 Pathfinder Skills to bootstrap the migration; Skill Forge grows the library after.
- It does not rip out the existing Pathfinder agent chain. The chain stays as the fallback path.
- It does not introduce a new sandbox runtime. Inngest first, Vercel function fallback, escalate if both fail.
- It does not open `execute_skill` to customer-authored code. Customer-authored Skills via the Metacron Skill Library are a Phase 3 conversation.

End Addendum 7.
