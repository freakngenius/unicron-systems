# Paste this into Claude Code

```
You are taking over a Perplexity Billion Dollar Build competition submission
mid-flight. The deadline is days away. The work is in this repo, branch
`main`, in the Pathfinder/ subproject.

Your single objective: make Perplexity Computer (PC) agents the visible
engine of the Pathfinder dashboard at https://zedcor.unicron.systems before
the submission deadline.

START HERE — READ THESE FILES IN ORDER, END TO END, BEFORE TAKING ANY ACTION:

  1. Pathfinder/zedcor-pc/handoff/00-START-HERE.md
  2. Pathfinder/zedcor-pc/handoff/01-pc-agents-spec.md
  3. Pathfinder/zedcor-pc/handoff/02-data-flow-spec.md
  4. Pathfinder/zedcor-pc/handoff/03-submission-narrative.md

After reading, do NOT ask me clarifying questions. The specs are complete.
Execute the plan in 01-pc-agents-spec.md ("Order of operations Claude Code
follows").

CONSTRAINTS (hard):

- Additive only. Do not break the existing Vercel cron pipeline. PC and
  cron coexist via the `runner` column on agent_log + agent_runs.
- Use existing `agent_name` CHECK constraint values only: ingestor,
  ranker, adjacent, verifier, outreach, pulse, competitive, briefing,
  customer-intel, eval. NEVER use 'pc-*' names.
- Do not redo the migration (20260524_zedcor_pc_additive.sql). Already
  deployed.
- Do not load more seed data. Already loaded.
- Do not refactor the dashboard UI. Submission is scored on PC being
  the engine, not pixel polish.

WHAT YOU WILL DO:

  1. Read each prompt file in Pathfinder/zedcor-pc/prompts/ and verify
     every SQL contract matches the deployed schema. Reference:
       - Pathfinder/lib/types.ts (Project interface)
       - Pathfinder/supabase/migrations/0002_tables.sql (base tables)
       - Pathfinder/supabase/migrations/20260524_zedcor_pc_additive.sql
         (new columns + tables)
     Fix any column-name mismatches in the prompts.

  2. Confirm each prompt has a preflight block:
       - lists available tools
       - confirms Supabase MCP is enabled on the chat
       - SELECT id FROM pathfinder.organizations WHERE slug='zedcor'
       - SELECT count(*) FROM pathfinder.hubs WHERE hub_slug='houston'
         AND organization_id = <that id>
     If any fails, the agent posts a BLOCKED message and stops.

  3. Confirm each prompt sets runner='pc' on every agent_log + agent_runs
     write.

  4. Tighten token budgets so each agent run costs under $5 USD on first
     dry run. Reduce per-source caps if needed.

  5. Save fixes back to the same prompt files.

  6. Write Pathfinder/zedcor-pc/handoff/04-paste-into-perplexity.md as
     a Kyle-facing step-by-step listing:
       a. Vercel + Google Cloud Console prerequisites (the API-key
          referrer fix for the map, listed in 02-data-flow-spec.md)
       b. Perplexity Space creation steps (Title, Description,
          Instructions block — Instructions block already drafted in
          earlier conversation; copy from
          Pathfinder/zedcor-pc/runbook/RUNBOOK.md step 7)
       c. Three chats with: which prompt file to paste, which model to
          use (GPT-5.5 for Ingestor, Opus 4.7 for Verifier and Customer
          Intel), what summary to expect, what to reply ('schedule') to
          flip to cron.
       d. The 4 acceptance-test SQL queries from 02-data-flow-spec.md
          for Kyle to run to verify the engine is alive.

  7. Investigate the dashboard issues from 02-data-flow-spec.md
     ("Why the dashboard currently shows 0 counters", "Why the map is
     black", "Chat panel — why it doesn't open") and if any has a
     trivial fix (< 30 min), fix it. Otherwise document in
     Pathfinder/zedcor-pc/handoff/99-blockers.md and move on.

  8. Commit your changes to a branch named `zedcor-pc-handoff-finish`
     and open a PR against main. PR description: list each prompt file
     touched + each handoff doc written + anything left in 99-blockers.

  9. Done. Stop. Do not start the PC agents yourself (you cannot —
     they run in Perplexity Spaces, which Kyle operates).

ACCEPTANCE — you are done when ALL FOUR are true:

  a. All three prompt files in Pathfinder/zedcor-pc/prompts/ have
     verified-correct SQL contracts and reasonable token budgets.
  b. Pathfinder/zedcor-pc/handoff/04-paste-into-perplexity.md exists
     and is a complete copy-paste runbook for Kyle.
  c. Pathfinder/zedcor-pc/handoff/99-blockers.md exists, listing any
     issues you couldn't fix (or "no blockers" if clean).
  d. PR opened against main from branch zedcor-pc-handoff-finish.

DEPENDENCIES YOU CANNOT RUN — DO NOT TRY:

  - You cannot paste prompts into Perplexity Spaces. Kyle does that.
  - You cannot test the live UI interactively. Kyle does that.
  - You cannot fix the Google Maps API key referrer restriction. Kyle
    does that in Google Cloud Console.
  - You cannot read Kyle's email or Slack. If you need clarification
    after reading the 4 spec docs, write the question in 99-blockers.md
    and proceed with the best-guess interpretation. Do not stall.

START. Begin with `cat Pathfinder/zedcor-pc/handoff/00-START-HERE.md`.
```

---

# Where to find this in the repo

After Kyle commits the handoff folder, this file lives at:

`Pathfinder/zedcor-pc/handoff/CLAUDE-CODE-PROMPT.md`

Workflow for Kyle:
1. In a terminal: `cd ~/wherever/unicron-systems && claude` (or however he invokes Claude Code)
2. Paste the block above (between the triple backticks) into Claude Code
3. Send. Claude Code reads the 4 spec docs and executes.
4. When Claude Code finishes its PR, Kyle reviews, merges, and follows the steps in `04-paste-into-perplexity.md` that Claude Code wrote.
