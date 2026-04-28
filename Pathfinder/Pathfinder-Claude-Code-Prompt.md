# Pathfinder — Claude Code Starting Prompt

---

Build Pathfinder. Read specs and design before writing code.

Working directory: `/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder`

Specs (read in order):

1. Pathfinder-PRD.md
2. Pathfinder-Build-Brief-Claude-Code.md
3. Pathfinder-Design-Feedback-Liveness.md
4. Pathfinder-Design-Feedback-Computer-As-Engine.md

Design: fetch and read its readme, implement Pathfinder Hi-Fi.html — https://api.anthropic.com/v1/design/h/gUxcVCzaBoZ5_UOtp2GUMA?open_file=Pathfinder+Hi-Fi.html

Skills: using-superpowers, writing-plans, subagent-driven-development, test-driven-development (only for `lib/scoring.ts`), verification-before-completion.

MCPs: Supabase, Vercel, GitHub, Notion (read Zedcor lead notes `347785c67e72809a86f3de8a9c4dfd7c` and Zedcor PoC `34d785c67e72803c9686ca3db173b049` for agent prompt context).

Stack (no substitutes): Next.js 14 App Router, Vercel, Supabase, Mapbox (Leaflet fallback), Tailwind. Anthropic + Perplexity only — no OpenAI in the stack.

Architecture frame: **Perplexity Computer is the engine, not a webhook caller.** Three named Computer agents (Ingestor, Ranker, Adjacent Discovery) run in Perplexity Spaces and write to Supabase via the Supabase MCP. Your job: author their system prompts in `prompts/`, build the dashboard that surfaces what they write. Do NOT build `/api/ingest` push endpoints. Do NOT run the agents.

Hard constraint: `lib/scoring.ts` is pure functions only. Zero API calls, zero Supabase calls. Phase 2 transplants it onto Zedcor's L4 GPUs.

All synthetic data. 5 Zedcor-mirror branches, 30 customers, real geographies.

**Supabase:** Pathfinder uses the existing `unicron-systems` Supabase project. All tables live in a dedicated `pathfinder` schema (not `public`). Project URL: `https://anfihcusvekpovcchpoh.supabase.co`. Service role and anon keys are in the user's 1Password under "Pathfinder · Supabase" — request them when needed. The DB Subagent's first migration creates the `pathfinder` schema, grants role access, and sets `search_path = pathfinder, public`. Every migration and query uses the `pathfinder.` prefix.

Write a plan to `docs/PLAN.md` with day-by-day checkpoints and the 5 subagent stream definitions. Confirm with me before dispatching subagents. No code until the plan is approved.
