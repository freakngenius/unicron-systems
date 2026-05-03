# Gate 7D — Production flag flip

**Filed:** 2026-05-02
**Status:** Queued — blocked on Gate 7C verification clean
**Parent:** `2026-05-02-pathfinder-gate7-lead-detail-redesign.md`

## Scope

Flip `LEAD_DETAIL_REDESIGN=1` in Pathfinder Vercel **Production** env. Per `Pathfinder/CLAUDE.md` deploy protocol, env-var changes are an allowed exception to the "never CLI deploy" rule (`vercel env add` for secrets management; the redeploy is triggered by the env update, not a manual deploy).

## Steps

1. `vercel env add LEAD_DETAIL_REDESIGN production` → value `1`
2. Trigger redeploy: push an empty `chore: trigger redeploy for LEAD_DETAIL_REDESIGN` commit to main (do NOT merge from feature branch — env change is enough; the empty commit ensures Vercel rebuilds with the new env value baked in)
3. Spot-check on production: open `/pathfinder/leads/sam.gov:TXDOT-I45-2026-001` — confirm redesign renders
4. Capture before/after production screenshots into `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/gate7d-prod-{before,after}-{houston,pittsburgh}.png`
5. Append entry to `MEMORY/demo-polish-ux-sprint-live-status.md` with prod-flip timestamp + sanity-check evidence

## Hard halt

- Any production lead detail page renders blank or with React error
- TxDOT flagship Quick Facts cells show different values vs. preview
- Bundle / LCP regression vs. preview measurement
- Slack / Teams / HubSpot integrations break (run `pnpm test` against prod read-only env to spot-check)

## After 7D

7-day stability watch begins. If clean through 2026-05-12, Gate 7E (archive old `ProjectFactsCard` + sidebar code) executes per `2026-05-12-archive-old-lead-detail.md`.
