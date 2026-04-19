# Unicron Systems — 5-Pattern Prototype Suite
## Build Specification

**Outcome:** a deployed Next.js app at `unicron-systems.vercel.app` that demonstrates all five living-systems coordination patterns (Mycelium, Beehive, Ant Colony, Murmuration, Slime Mold) as working prototypes running on the same infrastructure. Each is demoable in under 60 seconds. Each is wired to Supabase, Notion, and Anthropic. Tests pass. Deploy is green.

**Non-goals:** multi-tenant auth, billing, rate limiting, enterprise observability. These are prototypes for the contest demo — real systems, real data, real integrations, but single-user scope.

---

## 1. Architecture

### Stack
- **Framework:** Next.js 14 App Router, TypeScript strict mode
- **UI:** Tailwind + shadcn/ui, dark theme, design tokens matching the public paradigm map
- **Database:** Supabase (Postgres + Realtime) — project `anfihcusvekpovcchpoh`
- **Auth:** Supabase anon key, single-user dev mode. Gate routes with a simple `ADMIN_PASSCODE` env var
- **LLM:** Anthropic SDK (`@anthropic-ai/sdk`), model `claude-sonnet-4-6` by default, `claude-haiku-4-5-20251001` for cheap/parallel calls
- **Notion:** `@notionhq/client`, parent page `347785c67e728096bd2dcaa75b5928d1`
- **Scheduling:** Vercel Cron for decay ticks + prune cycles
- **Deploy:** Vercel project `kekas-projects-89ac4317/unicron-systems`
- **Repo:** `github.com/freakngenius/unicron-systems` (confirm current state before scaffolding — may already have a Next.js app at root; build this suite under `/Product` or wire as a workspace, your call)

### Monorepo vs single app
One app, five routes, one meta-dashboard. Patterns share DB, Notion client, Anthropic client, and UI shell. They are not separate apps.

### Route map
```
/                       → marketing landing (can be a simple welcome)
/app                    → meta-dashboard, live status of all 5 patterns
/app/mycelium           → signal memory UI
/app/beehive            → pipeline UI
/app/colony             → swarm UI
/app/murmuration        → variant grid UI
/app/slime              → selection tree UI
/api/mycelium/*         → signal drop, read, decay tick
/api/beehive/*          → pipeline run + stage status
/api/colony/*           → swarm dispatch + SSE stream
/api/murmuration/*      → flock run
/api/slime/*            → seed, cycle, read
/api/cron/*             → scheduled tick endpoints (Vercel Cron)
```

### Environment variables (Vercel + local `.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://anfihcusvekpovcchpoh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
NOTION_API_KEY=...
NOTION_PRODUCT_PAGE_ID=347785c67e728096bd2dcaa75b5928d1
CRON_SECRET=...          # Vercel Cron shared secret
ADMIN_PASSCODE=...       # simple gate for /app routes
```

Never commit `.env.local`. Use Vercel env var UI for production. Stop and ask if any key is missing at build time.

---

## 2. Design System

Match the public paradigm map. Dark theme, serif display, mono for meta. All patterns share these tokens so the suite reads as one organism.

```css
--bg: #0a0a0f
--bg-2: #12121a
--bg-3: #171720
--ink: #e8e6de
--ink-2: #9a9689
--ink-3: #5c5a52
--line: #2a2a32
--accent: #9fd4a1      /* frontier green */
--accent-2: #d4c87a    /* amber */
--accent-3: #b5d4e8    /* slate-blue */
--accent-4: #c4a5d4    /* violet */
--accent-5: #d4a592    /* coral */
```

Pattern-to-color (consistent across whole app):
- Mycelium → slate-blue
- Beehive → amber
- Ant Colony → green
- Murmuration → violet
- Slime Mold → coral

Fonts: `Iowan Old Style, Palatino, Georgia, serif` for display + body prose. `Inter` for UI. `JetBrains Mono` for meta, timestamps, IDs.

Top nav in `/app`: brand (links to `unicron-paradigm-map.netlify.app`), 5 pattern links, meta-dashboard link.

---

## 3. Foundation

Build order: do this before any pattern.

1. Inspect current repo state at `github.com/freakngenius/unicron-systems`. If a Next.js app already exists at root, decide: extend it, or put the Product suite in a subfolder. Document your choice in `README.md`.
2. Scaffold in `/Users/keka/Dropbox/Projects/Unicron Systems/Product` (or wherever your decision above lands).
3. Install: `next`, `react`, `typescript`, `tailwindcss`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `@notionhq/client`, `zod`, `shadcn-ui`, `vitest`, `@playwright/test`.
4. Wire env vars. Fail-fast on missing keys at server start.
5. Generate Supabase types: `supabase gen types typescript --project-id anfihcusvekpovcchpoh > lib/db.types.ts` (assumes Supabase CLI auth is configured; if not, stop and ask).
6. Create shared lib: `lib/supabase.ts`, `lib/anthropic.ts`, `lib/notion.ts`, `lib/logger.ts`.
7. Build the shared UI shell: top nav + sidebar (5 pattern links) + main content area.
8. Deploy empty shell to Vercel. Verify green deploy before building pattern logic.
9. Seed Notion workspace: under product page, create databases: "Signals (Mycelium)", "Pipeline Runs (Beehive)", "Swarm Jobs (Colony)", "Flock Runs (Murmuration)", "Selections (Slime)". Store database IDs in a `lib/notion-ids.ts` module (re-run setup script to create and cache IDs if first run).
10. Add Vercel Cron config: hourly decay for Mycelium, daily prune for Slime Mold.

---

## 4. Pattern 1 — Mycelium (Signal Memory)

### What it demonstrates
A shared substrate where agents drop typed signals. Strong signals reinforce and surface. Weak signals decay and disappear. Self-prioritizing team memory.

### Fake scenario
Unicron team discovery signals. Mixed agents (CEO, Research, CMO, Kyle, Keenan) drop facts, questions, patterns, risks across topics (verticals, ICP, pricing, competitors, deals). Over time, some themes reinforce (PA pain points get mentioned repeatedly), others go stale.

### Supabase schema
```sql
create table signals (
  id uuid primary key default gen_random_uuid(),
  topic text not null,              -- e.g. 'public-adjusters'
  type text not null check (type in ('FACT','QUESTION','PATTERN','RISK')),
  source_agent text not null,       -- 'CEO','Research','CMO','Kyle','Keenan'
  body text not null,
  strength numeric not null default 1.0 check (strength >= 0),
  last_touched timestamptz not null default now(),
  ttl_days int not null default 14,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);
create index signals_topic_strength on signals (topic, strength desc) where archived = false;
create index signals_last_touched on signals (last_touched);
```

### API
- `POST /api/mycelium/signals` — body: `{topic, type, source_agent, body}`. LLM extracts/validates type. Returns the signal. If the body reinforces an existing signal (semantic match via embedding OR simple LLM similarity check), increment that signal's `strength` and update `last_touched` instead of creating a new row.
- `GET /api/mycelium/signals?topic=X&limit=10` — returns top N strongest active signals for a topic.
- `POST /api/cron/mycelium-decay` — hourly. Decrement strength by a factor of `age_days / ttl_days`. Archive rows with strength < 0.1. Requires `CRON_SECRET` header.
- `POST /api/mycelium/promote/:id` — if strength > 5 for > 3 days, create/update a Notion page under "Promoted Signals" in the Notion workspace.

### Agent logic
Single Claude call on `POST /signals` that:
1. Classifies the body into one of the four types if not given.
2. Normalizes the topic slug.
3. Finds the closest matching existing signal for that topic and decides reinforce-or-new (threshold: similarity > 0.8).
4. Returns structured JSON.

### UI
- `/app/mycelium`
- Left column: topic list, sorted by total active signal strength descending.
- Main panel: grid of signal cards for the selected topic. Strength shown as a bar + as font opacity (low strength = dim). Type shown as a tag chip (FACT/QUESTION/PATTERN/RISK). Source agent as a mono monogram.
- "Drop signal" form at the top: free text input; body classifies/extracts on submit.
- Each card shows `last_touched`, age, `strength`, `ttl`, and a "reinforce" button that bumps strength +1.

### Seed data
30 signals across 6 topics, varying strength/age/source. Load from `fixtures/mycelium-seed.json`. Include one "promoted" signal (strength 8.5+, >3 days old) that surfaces the Notion mirror flow on first demo.

### Tests
- Unit: reinforcement logic, decay math, similarity threshold
- Integration: drop signal → appears in list → cron decays → dims appropriately
- E2E (Playwright): load `/app/mycelium`, drop signal, verify it appears in top position

### Demo flow (60s)
1. Open `/app/mycelium`. Pre-seeded topics visible.
2. Click "public-adjusters." Show strong signals at top, weak at bottom.
3. Drop a new signal: "Three PAs today said they lose $8k/claim from missed deadlines." Watch it classify as FACT, merge with existing "PA pain: $5-10k settlement delay" signal, boost strength.
4. Trigger decay manually (dev button). Watch stale signals fade.
5. Show the Notion promoted-signals page mirror.

---

## 5. Pattern 2 — Beehive (Specialist Pipeline)

### What it demonstrates
A production assembly line with typed handoffs. Agents bounce back on schema failure. Max 2 retries. Quality stays high at throughput.

### Fake scenario
Lead-to-First-Email: user pastes a company URL → Research extracts context → Strategy picks an angle → Copy writes a 3-line cold email → Validator checks against the final schema → output is a send-ready draft.

### Supabase schema
```sql
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  input_url text not null,
  status text not null check (status in ('running','succeeded','failed')),
  final_output jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  stage_name text not null check (stage_name in ('research','strategy','copy','validate')),
  input_json jsonb,
  output_json jsonb,
  validation_status text check (validation_status in ('pass','fail','bounced')),
  retry_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index pipeline_stages_run on pipeline_stages (run_id, started_at);
```

### Schemas (Zod)
```ts
ResearchOutput = { company_name, one_line_desc, recent_signal, industry, size_est }
StrategyOutput = { angle, hook, pain_we_address }
CopyOutput = { subject, line1, line2, line3, cta }
ValidatorOutput = { pass: boolean, issues: string[] }
```

### API
- `POST /api/beehive/run` — `{input_url}` → starts pipeline, returns `run_id`.
- `GET /api/beehive/runs/:id` — returns run + all stage rows for live status polling.
- Pipeline executes server-side via background task (simple async; for Vercel, use `after()` or stream via SSE).

### Agent logic
Four Claude calls:
1. `research` — given URL, returns ResearchOutput JSON.
2. `strategy` — given ResearchOutput, returns StrategyOutput JSON.
3. `copy` — given StrategyOutput, returns CopyOutput JSON.
4. `validator` — given CopyOutput, checks: no hallucinated claims, subject < 55 chars, lines < 20 words each, has a CTA. Returns pass/fail + issues.

If validator fails → bounce to `copy` with issues appended → max 2 retries → else mark run `failed`.

For fake scenario, if `input_url` matches one of 5 seeded fixture URLs, Research returns pre-canned data (no real scraping). If unknown URL, Research makes a real Claude call.

### UI
- `/app/beehive`
- Top: input field + "Run" button.
- Main: horizontal pipeline visualization — 4 stage nodes (Research → Strategy → Copy → Validator) connected by arrows. Node colors: gray=pending, amber=running, green=pass, red=fail, orange=bounced.
- Click a stage node → side panel shows input JSON + output JSON + retry count.
- Bottom: run history table, last 10 runs.

### Seed data
5 fixture URLs with pre-canned Research outputs in `fixtures/beehive-seed.json` — cover: a mid-size SaaS, a public adjuster firm, a mold remediation company, a property data vendor, a restoration franchise.

### Tests
- Unit: each agent's JSON schema parses correctly, validator rejects bad inputs
- Integration: full run completes, validator-bounce retries, max-retry fails
- E2E: paste URL → watch stages light up → final email visible

### Demo flow (60s)
1. Paste `publicadjustersflorida.com` (fixture).
2. Watch Research (amber) → Strategy (amber) → Copy (amber) → Validator (red, BOUNCE) → Copy retry (amber) → Validator (green).
3. Show final email.
4. Show the Notion "Pipeline Runs" database entry written for this run.

---

## 6. Pattern 3 — Ant Colony (Parallel Discovery Swarm)

### What it demonstrates
Fan out N cheap agents in parallel on a target list. No coordination. Aggregate results into emergent clusters.

### Fake scenario
Market-pain discovery. User picks a vertical ("public adjusters" / "mold remediation" / "property data"). Swarm of 50 agents "scrapes" sources — really reads from seeded fixture blobs simulating Reddit threads, Yelp reviews, BBB complaints, subreddit posts. Each extracts `{pain_quote, tool_named, price_named, urgency}`. Aggregator clusters into themes.

### Supabase schema
```sql
create table swarm_jobs (
  id uuid primary key default gen_random_uuid(),
  market_query text not null,
  target_count int not null,
  completed_count int not null default 0,
  status text not null check (status in ('running','succeeded','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table swarm_workers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references swarm_jobs(id) on delete cascade,
  target_ref text not null,
  output_json jsonb,
  status text not null check (status in ('pending','running','done','errored')),
  runtime_ms int,
  created_at timestamptz not null default now()
);
create table swarm_clusters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references swarm_jobs(id) on delete cascade,
  theme text not null,
  size int not null,
  examples jsonb not null
);
```

### API
- `POST /api/colony/dispatch` — `{market_query, target_count}` → creates job + worker rows → fires parallel Claude Haiku calls (batched, concurrency cap 10) → returns `job_id`.
- `GET /api/colony/jobs/:id/stream` — Server-Sent Events feed. Emits a worker-completed event every time a worker finishes. Completes with cluster summary.
- `GET /api/colony/jobs/:id` — final state.

### Agent logic
Per-worker: Claude Haiku call that takes a text blob + extraction schema, returns `{pain_quote, tool_named?, price_named?, urgency_1_5}` JSON.
Aggregator: a single Claude Sonnet call at the end that reads all worker outputs and clusters pain quotes into themes, naming each theme.

Use Haiku for workers (cheap, fast, parallel). Cap concurrency at 10 to respect rate limits.

### UI
- `/app/colony`
- Top: market selector (5 fixture options) + "Dispatch" button.
- Main: live swarm grid — 50 dots in a 10×5 layout. Each dot fades in from gray to green as it completes. Counter top-right: `completed/total`.
- Right rail: live feed of incoming pain quotes as they return.
- Bottom (on completion): cluster view — themes as chips, sized by cluster size, click to expand examples.

### Seed data
Per market, a fixtures/colony/{market}.json with 50 pre-written target blobs simulating realistic pain language. Generate these once; commit to repo.

### Tests
- Unit: extraction schema, concurrency cap, aggregator clustering
- Integration: dispatch 50 → all complete → clusters emerge
- E2E: pick market, watch grid fill, verify clusters render

### Demo flow (45s)
1. Pick "mold remediation."
2. Click "Dispatch." Watch 50 dots fill in over ~30 seconds.
3. Live feed shows pain quotes streaming in.
4. On complete, cluster view appears: "Remediation pricing opacity (12)," "Insurance dispute burnout (9)," "Tool: ServiceTitan complaints (7)," etc.

---

## 7. Pattern 4 — Murmuration (Local-Peer Variant Engine)

### What it demonstrates
7 agents iterate on a generation task. Each sees only the 3 most recent peer outputs as inspiration. No central editor. Coherence or divergence emerges from local rules.

### Fake scenario
Landing page headline variants for a fake startup: "AcmeMold — AI that stops mold from ruining your home." 7 agents × 5 cycles = 35 variants. Grid shows all variants with peer-reference arrows.

### Supabase schema
```sql
create table flock_runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  peer_n int not null default 3,
  cycles int not null default 5,
  agent_count int not null default 7,
  status text not null check (status in ('running','succeeded','failed')),
  created_at timestamptz not null default now()
);
create table flock_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references flock_runs(id) on delete cascade,
  agent_idx int not null,
  cycle int not null,
  content text not null,
  peer_refs jsonb not null,    -- array of peer output IDs referenced
  created_at timestamptz not null default now(),
  unique (run_id, agent_idx, cycle)
);
```

### API
- `POST /api/murmuration/run` — `{prompt, peer_n, cycles, agent_count}` → launches run → returns `run_id`.
- `GET /api/murmuration/runs/:id` — returns run + all outputs.
- Use SSE for live updates as each cycle completes.

### Agent logic
Per agent per cycle: Claude call with system prompt "You are agent N in a flock. Here are the 3 most recent peer outputs: [...]. Produce a variant that is inspired but distinct. Differentiate." Returns single variant string.

Cycle ordering: all 7 agents produce variant for cycle K before any proceeds to K+1. After each output, it becomes available for peer reference in future cycles.

### UI
- `/app/murmuration`
- Top: prompt field + "Run flock" button.
- Main: grid — 7 columns (agents), 5 rows (cycles). Each cell = a variant. Cells color-tint by cycle (early light → late violet).
- Hover a cell: highlight the 3 peer-reference cells it was inspired by (faint lines between).
- Bottom: "convergence heat" — a simple metric showing how much consensus emerged (short-name token overlap by final cycle).

### Seed data
None needed — run on demand. Seed a few completed runs for fast demo if time allows.

### Tests
- Unit: peer selection (always most recent 3 excluding self)
- Integration: full 7×5 grid fills, peer_refs reference real prior outputs
- E2E: run flock, verify grid renders, peer arrows draw correctly

### Demo flow (60s)
1. Prompt is pre-filled with AcmeMold pitch.
2. Click "Run flock."
3. Watch grid fill row-by-row. 5 cycles × 7 agents = 35 variants.
4. Hover a late-cycle winner; arrows trace back to its inspirations.
5. Pick the top 3 and export to clipboard.

---

## 8. Pattern 5 — Slime Mold (Prune-and-Converge Selector)

### What it demonstrates
Adaptive selection. Many candidates → parallel evaluation → prune weak → double resources on strong → repeat → converge on 1-2 winners.

### Fake scenario
Vertical selection for Unicron Systems. 10 vertical hypotheses seeded with criteria: TAM, contest fit, competitive risk, traction speed, demoability. Judge agent scores each per cycle. Bottom 50% pruned each cycle. 3 cycles → final 1-2 winners. Final state mirrored to Notion "Vertical Decisions" page with reasoning trail.

### Supabase schema
```sql
create table selection_runs (
  id uuid primary key default gen_random_uuid(),
  criteria jsonb not null,          -- e.g. {tam: 0.25, fit: 0.25, risk: 0.2, speed: 0.15, demoable: 0.15}
  cycles_planned int not null default 3,
  status text not null check (status in ('running','succeeded','failed')),
  created_at timestamptz not null default now()
);
create table candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references selection_runs(id) on delete cascade,
  hypothesis text not null,
  context jsonb not null,           -- {tam_usd, competition_notes, etc.}
  current_score numeric,
  resource_share numeric not null default 1.0,
  alive boolean not null default true,
  eliminated_at_cycle int,
  created_at timestamptz not null default now()
);
create table score_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  cycle int not null,
  score numeric not null,
  reasoning text not null,
  criteria_breakdown jsonb not null,
  created_at timestamptz not null default now()
);
```

### API
- `POST /api/slime/seed` — `{hypotheses: [...], criteria}` → creates run + candidate rows.
- `POST /api/slime/cycle/:run_id` — advances one cycle: scores all alive candidates, prunes bottom 50%, doubles resource_share on survivors, writes score_events. Idempotent per cycle.
- `GET /api/slime/runs/:id` — full state for UI.
- `POST /api/cron/slime-tick` — advances any runs scheduled to tick. For demo: manual via UI button; cron is real but runs weekly.

### Agent logic
Judge: a single Claude Sonnet call per candidate per cycle. Takes hypothesis + context + criteria weights + weights. Returns structured JSON `{score_0_100, per_criterion: {...}, reasoning}`.

Pruning rule: keep top 50% rounded up. Tie-break by TAM if tied.

### UI
- `/app/slime`
- Top: "Seed selection" (loads fixture hypotheses) + "Run cycle" buttons.
- Main: tree / Sankey-style visualization showing all candidates over cycles. Surviving paths thicken cycle-over-cycle; pruned paths dash out with "X" marker. Final survivors highlighted coral.
- Click a candidate: side panel shows hypothesis, score trajectory, full reasoning per cycle.
- Bottom: final summary — winners with composite scores + linked Notion page.

### Seed data
`fixtures/slime-seed.json` — 10 vertical hypotheses: 7 from our existing research (Public Adjuster, Property Data, Mold Remediation, Trade Payments, PE Back Office, Restoration Ops, Estate Settlement) + 3 plausible distractors (Veterinary Practice Ops, Funeral Home Software, Commercial HVAC Intelligence). Each with TAM, competition notes, traction assumptions.

### Tests
- Unit: pruning rule, scoring math, resource_share calc
- Integration: 3-cycle run reduces 10 → 5 → 3 → 2, final state mirrored to Notion
- E2E: seed → run 3 cycles → verify tree renders → verify Notion update

### Demo flow (60s)
1. Click "Seed selection." 10 hypotheses appear as thin horizontal lines.
2. Click "Run cycle" three times (or "Run all").
3. Watch tree prune: 10 → 5 → 3 → 2. Survivors thicken. Pruned ones fade + X.
4. Click winner → show score trajectory, reasoning per cycle.
5. Open Notion "Vertical Decisions" page in another tab — already populated.

---

## 9. Meta Dashboard (`/app`)

Not a pattern; the layered view. Shows all 5 running at once.

### What it displays
- **Mycelium tile** — top 3 strongest signals overall across all topics.
- **Beehive tile** — last run status + stage indicators.
- **Colony tile** — active jobs + latest cluster summary.
- **Murmuration tile** — last run's convergence heat + top 3 variants.
- **Slime tile** — current alive candidates + last cycle's prune count.

Each tile is a card linking to the pattern's full UI. Big "Run Demo Suite" button at top that triggers one pre-canned run of each in sequence for a scripted judge walkthrough.

### Implementation
Simple server component that reads summary data from each pattern's Supabase view. Low-frequency revalidation (30s). No realtime needed on the meta view.

---

## 10. Notion Integration

Parent page: `347785c67e728096bd2dcaa75b5928d1`

### Databases to create under the product page
| Database | Purpose | Pattern |
|----------|---------|---------|
| Signals | Promoted Mycelium signals (strength > 5 for > 3 days) | Mycelium |
| Pipeline Runs | Completed Beehive runs with final email | Beehive |
| Swarm Jobs | Ant Colony job summaries + cluster themes | Ant Colony |
| Flock Runs | Murmuration run outputs + top variants | Murmuration |
| Vertical Decisions | Slime Mold final selections with reasoning | Slime Mold |

On first run, `lib/notion-setup.ts` creates these databases if absent and caches their IDs in a `notion_meta` Supabase table. Idempotent.

### Agent Memory connection (optional stretch)
If there's an existing "Agent Memory" page in the Notion workspace, Mycelium signals that cross the promote threshold can additionally append to that page. Read-only enough to not corrupt manual edits.

---

## 11. Production Checklist

Before declaring done:

- [ ] `npm run build` passes with zero warnings
- [ ] `npm run test` passes — unit + integration
- [ ] `npm run test:e2e` passes — at least one E2E per pattern
- [ ] Vercel production deploy is green
- [ ] All env vars set in Vercel UI
- [ ] `ADMIN_PASSCODE` gate works on `/app/*` routes
- [ ] Cron jobs configured in `vercel.json`: mycelium-decay hourly, slime-tick daily (off by default, manual via UI for demo)
- [ ] Seed data loaded in production Supabase: 30 signals, 5 pipeline fixtures, 3 colony markets × 50 blobs each, 10 slime hypotheses
- [ ] Notion databases exist under product page with correct schemas
- [ ] Meta dashboard loads < 2s with real data
- [ ] Each pattern demo completes in < 60s
- [ ] No secrets in git history (`git log --all -p | grep -i 'key\|secret\|password'` clean)
- [ ] README documents: local dev setup, demo script, architecture
- [ ] Changelog / release notes

---

## 12. Test Plan

### Coverage targets
- Unit: 60%+ on core logic (agents, schemas, pruning/decay math)
- Integration: one happy-path + one failure-path per pattern's API
- E2E: one full demo flow per pattern rendered in browser

### Critical paths to test
1. Mycelium: drop → reinforce → decay → archive → promote-to-Notion
2. Beehive: full run → validator bounce → retry → success
3. Colony: dispatch 50 → all complete → clusters generated
4. Murmuration: 7×5 grid completes, peer_refs are valid
5. Slime: 10 → prune to 5 → prune to 3 → prune to 2, Notion mirror correct

### Tooling
- Vitest for unit + integration
- Playwright for E2E against local `npm run dev`
- A `test:seed` script that wipes the dev Supabase project's Product tables and reloads fixtures

---

## 13. Demo Script (for judges, 90 seconds total)

1. Open `/app` — 5 tiles visible, all live.
2. Click "Run Demo Suite" — cues all 5 to run in sequence in the background.
3. Talk through each tile as it updates: Mycelium memory (6s), Beehive pipeline (15s), Colony swarm (20s — most dramatic), Murmuration grid (20s), Slime tree (20s).
4. Click into Slime final — show Notion page with full reasoning trail.
5. Pitch: "Five coordination patterns. One system. Two humans and Computer vs. fifty."

---

## 14. Operating Rules for the Build Agent

These are hard constraints. Violate them only if user explicitly says otherwise.

- **One commit per meaningful unit.** Conventional Commits format. Push to the GitHub repo regularly — don't let the working branch drift > 2h.
- **Never commit secrets.** Check `.gitignore` covers `.env*`, then double-check each commit.
- **Never break the existing paradigm-map deploy.** That lives on Netlify (different infra, unrelated repo). Don't touch its files except to add links.
- **Use subagents for parallelizable work.** Mycelium, Beehive, Colony, Murmuration, Slime are largely independent after foundation — fan out.
- **TDD where it makes sense.** Schemas, pruning/decay math, validators — tests first. UI can come after.
- **Verify before claiming done.** Actually run the test. Actually curl the deploy. Actually check that the Notion page was written.
- **Stop on true blockers.** Missing credentials, ambiguous design call the user needs to make, production outage. Otherwise keep moving — make the reasonable default choice and note it in the PR description.
- **Report progress in the PR, not in commentary.** Each pattern gets its own PR; each PR description lists demo steps, test commands, and open follow-ups.

---

## 15. Claude Code Starter Prompt

Paste the prompt below into Claude Code opened in `/Users/keka/Dropbox/Projects/Unicron Systems/Product`. It runs end-to-end and only stops on true blockers.

```
Read ./build-specs.md end to end before doing anything else.

You are building a 5-pattern agentic prototype suite for Unicron Systems' Perplexity Billion Dollar Build contest entry. The spec is authoritative. Make reasonable defaults where it is silent. Stop only on true blockers.

Invoke skills in this order:

1. /using-superpowers — load foundational behavior.
2. writing-plans — produce a detailed implementation plan from the spec. Write it as PLAN.md and commit it.
3. test-driven-development — default for all feature work.
4. subagent-driven-development — after the foundation milestone, fan out the 5 pattern builds in parallel.
5. verification-before-completion — run before claiming any milestone done. Actually run tests, actually curl URLs, actually inspect Notion writes.
6. using-git-worktrees — if parallel pattern work benefits from isolation.
7. requesting-code-review — before merging each pattern PR.
8. finishing-a-development-branch — when a pattern is ready to ship.

Build sequence:
  A. Foundation — scaffold, env wiring, Supabase types, shared shell, Notion setup, empty deploy green.
  B. Build patterns in this order (per spec §14): Mycelium → Beehive → Ant Colony → Slime Mold → Murmuration.
  C. Meta dashboard at /app wiring all 5.
  D. Production checklist (spec §11), full demo script validation (spec §13).

Infrastructure (all existing, do not create new):
  - GitHub: github.com/freakngenius/unicron-systems
  - Supabase project: anfihcusvekpovcchpoh
  - Vercel project: kekas-projects-89ac4317/unicron-systems
  - Notion parent page: 347785c67e728096bd2dcaa75b5928d1

Hard rules (spec §14):
  - Never commit secrets. Use Vercel env vars in production.
  - Never touch the existing paradigm-map Netlify deploy.
  - Commit after every meaningful unit using Conventional Commits. Push regularly.
  - Verify every milestone with real tests and real URLs, not assertions.
  - Stop only on true blockers: missing credentials, ambiguous design calls, production incident.

Definition of done:
  - unicron-systems.vercel.app renders /app with 5 live pattern tiles.
  - Each pattern demo runs end-to-end in < 60s on the production URL.
  - All tests pass (unit, integration, E2E).
  - Notion databases populated under the product page.
  - README documents local dev, demo script, env vars.
  - No secrets in git history.
  - Final report: deployed URL, per-pattern screenshots or curl checks, open follow-ups.

Start now. Begin with the spec read and PLAN.md.
```
