# Eval scaffolding

Phase 1 G2 Task 4 placeholder. Phase 2 agent streams populate this with per-agent benchmark sets.

## Convention (per `MEMORY/conventions.md` + `00 - SKILLS & DISCIPLINES.md`)

```
eval/
├── README.md                  this file
├── <agent-role>/
│   ├── cases.json             { input, expected_output_shape, scoring_rubric }[]
│   └── run.ts                 runner that invokes the agent + scores against rubric
```

Examples expected in Phase 2:

- `eval/architect/` — 30 buyer-pain decomposition cases (Phase 2 Stream D)
- `eval/source-onboarder/` — 30 candidate-URL onboarding cases (Phase 2 Stream E)
- `eval/qualifier/` — 50 raw-event qualification cases (Phase 2 Stream A)
- `eval/ranker/` — 30 ranking cases (Phase 2 Stream A)
- `eval/drafter/` — 20 outreach drafting cases (Phase 2 Stream A)
- `eval/contact-resolver/` — 20 contact-extraction cases (Pathfinder Phase 2 follow-up)

Eval pass criteria are defined per agent in its spec. Quality regression on any agent gates production prompt updates.

## Runner

`eval/<agent-role>/run.ts` is invoked manually or via Inngest scheduled job (weekly). Outputs a JSON report with per-case scores; CI gates on regression vs the previous baseline.

Populated by Phase 2 streams; do not add cases here in Phase 1.
