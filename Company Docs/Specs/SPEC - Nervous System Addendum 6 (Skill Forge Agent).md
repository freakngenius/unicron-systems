# SPEC Addendum 6 - Skill Forge Agent

**Status:** Draft for engineer + Master Conductor handoff
**Parent SPECs:** SPEC - Unicron Nervous System.md, Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md
**Depends on:** Addendum 5 (Procedural Memory Layer)
**Companions:** Addendum 4 (Scenarios + Satisfaction + DTU)
**Date:** 2026-05-14
**Owner:** Kyle Kesterson
**Parent PRD:** PRD - Procedural Memory & Skill Forge.md

Skill Forge is the fifth always-on agent. It observes the ledger, distills successful trajectories into proposed Skills, and queues them for human plus Taboo Keeper approval. It never writes to `nervous_system.skills` directly. It writes only to `nervous_system.proposed_skills`.

Merge into the parent SPEC's agent layer section at v0.6 after Sprint 10 ships.

---

## 1. Why a fifth agent and not an Analyst extension

The Analyst already pattern-finds from the ledger. The temptation is to fold distillation into it. Resist it. The contract is different:

- **Analyst** summarizes for humans. Its output is prose for a person to read (the morning digest, the continuity entries).
- **Skill Forge** distills for re-execution. Its output is a runnable artifact for an agent to invoke.

They share a query layer over the ledger. They produce different things. Keeping them separate keeps each one's prompt and budget legible. Skill Forge collisions with the Analyst are a stated risk in the PRD; the contract above is the mitigation.

---

## 2. Registration

Add to `nervous_system.agents` via a seed migration, matching the live shape of that table (query it first per the migration safety rule):

```
slug:                skill_forge
archetype:           distiller
on_call:             false
model:               claude-sonnet-4-6
fallback_model:      claude-haiku-4-5
budget_usd_per_day:  5.00
reciprocity_hooks:   {} (empty default, per parent SPEC R3 placeholder)
```

The agent appears as a node in the Atrium System tab Agents Galaxy automatically once registered, via the existing `ns_list_agents()` RPC.

---

## 3. Observation loop

Inngest cron, every 6 hours. Register alongside the existing agent crons.

1. **Pull candidate trajectories** from the ledger:
   - Resolved Cowork threads with `outcome = 'success'` in the last 24 hours.
   - Voice agent calls of type `procurement_pull` with `outcome = 'structured_record_captured'`.
   - Slack Orchestrator chains with >= 3 tool calls and a positive user reaction.
   - Architect proposals that successfully onboarded a Tier-1 source.

2. **Filter for novelty.** The trajectory must not embed within 0.85 cosine of any existing approved Skill's embedding. This avoids re-proposing what already exists.

3. **Distill.** Use the prompt template at `vault/Memory/skills/skill_forge/distill.md` (vault path, consistent with the Karpathy pattern from Addendum 2). Output is a Skill draft: `name`, `description`, `domain`, `inputs_schema`, `outputs_schema`, the SKILL.md recipe body, an optional `code_body`, and an `evidence` array of ledger row IDs.

4. **Self-score.** Run the Addendum 4 satisfaction validator on the distilled Skill against its source trajectory.
   - Score < 0.75: drop, log to audit.
   - Score 0.75 to 0.89: queue with `confidence = 'medium'`.
   - Score >= 0.90: queue with `confidence = 'high'`.

5. **Taboo pre-check.** Call Taboo Keeper in dry-run mode. Hard refusal: drop and log. Soft flag: queue with the flag attached in `taboo_flags` so the human reviewer sees it.

6. **Write to `nervous_system.proposed_skills`** with the satisfaction score, the Taboo Keeper dry-run result, the trajectory summary, and `status = 'queued'`.

7. **Notify.** Post a proposal card to the Slack channel `#skill-forge-proposals`. Default review cadence: Keenan on Mondays, Kyle on Thursdays, Curtis covers when either is heads-down. Any of the three may approve; all three have peer authority.

---

## 4. Refinement loop

If an approved Skill's `success_count / run_count < 0.7` over its last 10 invocations and `run_count >= 10`:

1. Pull the failing invocations from `nervous_system.skill_invocations`.
2. Distill a refinement against the existing Skill. This is a new version, not an edit.
3. Set `parent_skill_id` on the proposed Skill to the underperforming Skill's id.
4. Queue it as a proposal.
5. On approval, the old Skill moves to `lifecycle_status = 'retired'` and the new version takes over its `name` at `version + 1`.

Skill Forge never mutates an approved Skill. Lineage flows through versions only. This is the structural answer to the Hermes "self-improvement overwrites manual edits" failure mode.

---

## 5. Resource caps

- Maximum 20 proposals per 24-hour cycle. Above that, score-rank and drop the tail.
- Daily inference budget $5, overridable in `nervous_system.agents.budget_usd_per_day`.
- Taboo Keeper hard refusal: log, do not retry.

These are agent operating limits, not the numeric cost caps banned from sprint prompts. The ban in CLAUDE.md is on time estimates and budget caps written into paste-ready prompts as safeguards. An agent's own daily budget in its registration row is configuration, and it is allowed.

---

## 6. Failure modes and telemetry

| Event | Channel | Action |
|---|---|---|
| Distillation fails 3 times on the same trajectory | `#alerts-skill-forge` | Stop retrying, flag for manual review |
| Taboo Keeper hard-refuses >= 5 proposals in 24 hours | `#alerts-skill-forge` | Pause Skill Forge, page Kyle |
| Proposal queue exceeds 50 unreviewed | `#alerts-skill-forge` | Pause Skill Forge until the queue is under 25 |
| Daily budget hit | `#alerts-skill-forge` | Pause until the next UTC day |

All four events also write to `nervous_system.audit_log`. Sentry wiring for Skill Forge errors lands in Sprint 12.

---

## 7. Acceptance scenarios (Addendum 4 style)

Stored at `vault/wiki/scenarios/skill-forge/`. Satisfaction threshold 0.85.

- **S6.1** A successful Cowork thread becomes a proposed Skill within 6 hours with a non-empty `evidence` array.
- **S6.2** A near-duplicate of an existing Skill does not become a proposal (the novelty filter works).
- **S6.3** A proposal with satisfaction below 0.75 is dropped, not queued.
- **S6.4** An underperforming approved Skill triggers a refinement proposal with `parent_skill_id` set.
- **S6.5** Skill Forge cannot write to `nervous_system.skills` even with elevated permissions (RLS plus service-role separation; the write trigger from Addendum 5 rejects writes without a `taboo_check_id`).
- **S6.6** The daily budget cap halts the cron mid-cycle and it resumes cleanly the next day.

---

## 8. Human review surface

The Atrium Library tab gets a "Proposals" sub-tab (built in Sprint 10). Each queue card shows:

- The trajectory summary and the `evidence` ledger pointers.
- The satisfaction score and `confidence` flag.
- Any Taboo Keeper soft flags.
- The diff against any existing Skill (when `parent_skill_id` is set).
- Approve, request-changes, and reject actions.

Approve runs Taboo Keeper as a hard check, then inserts into `nervous_system.skills` with `lifecycle_status = 'approved'`, `author_kind = 'skill_forge'`, `approved_by`, `approved_at`, and the `taboo_check_id`. It then posts to `#skill-forge-proposals`.

---

## 9. What this addendum does NOT do

- It does not implement `execute_skill`. Skill Forge produces Skills; Addendum 7 makes them callable as a single inference.
- It does not give Skill Forge any write path to `nervous_system.skills`. Proposals only.
- It does not auto-approve. Promotion to an approved Skill is human plus Taboo Keeper. Promotion of a kanban card to Verified is human-only, unchanged.
- It does not build the Metacron per-tenant proposal surface. That is Sprint 11.

End Addendum 6.
