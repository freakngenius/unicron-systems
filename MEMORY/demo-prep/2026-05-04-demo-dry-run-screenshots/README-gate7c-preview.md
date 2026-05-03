# Gate 7C — Lead Detail Redesign preview-deploy capture checklist

Companion to `README.md` (Gate 5 production dry-run plan). This file scopes the **preview-deploy** captures for the Lead Detail Redesign behind `LEAD_DETAIL_REDESIGN=1`.

Filenames follow `gate7c-<scenario>-<viewport>.png` (distinct from Gate 5's `beat-NN-*.png` convention so the two capture sets don't collide).

## Pre-flight (Kyle)

1. Confirm PR for Gate 7C is open (or merged to main).
2. In Vercel dashboard for Pathfinder project → **Environment Variables** → preview env → add `LEAD_DETAIL_REDESIGN=1` scoped to branch `demo-polish-ux/gate7c-preview-verification-bundle-instrument`.
   - CLI alternative: `vercel env add LEAD_DETAIL_REDESIGN preview` (value `1`)
3. Wait for the preview deploy to finish on the latest commit of that branch.
4. Open the preview URL in your browser. Navigate to a lead — confirm the redesigned single-column layout renders.

## Capture beats

| # | URL / state | Viewport | Filename | Acceptance criterion |
|---|---|---|---|---|
| 1 | `/pathfinder/leads/sam.gov:TXDOT-I45-2026-001` | Desktop 1440×900 | `gate7c-houston-flagship-desktop-full.png` | Full-page snapshot for visual diff |
| 2 | Houston flagship — Quick Facts grid close-up | Desktop | `gate7c-houston-flagship-quick-facts.png` | #1 — all 9 cells correct |
| 3 | Houston flagship — Cross-Pollination card with Brasfield + Big-D | Desktop | `gate7c-houston-flagship-cross-poll.png` | #2 — EXACT magenta chips |
| 4 | Houston flagship — Decision Bar + Recommended Action | Desktop | `gate7c-houston-flagship-decision-bar.png` | #3 + #4 — extracted action + verdict line |
| 5 | Houston flagship | Mobile 375×812 (iPhone 13 mini) | `gate7c-houston-flagship-mobile.png` | #8 — Quick Facts stacks to 1 col, no horizontal scroll |
| 6 | A Pittsburgh sparse lead (find one with empty enrichment fields) | Desktop | `gate7c-pittsburgh-sparse-empty-states.png` | #7 — empty-state labels never bare `—` |
| 7 | A rejected lead (any with `rejection_reason` populated) | Desktop | `gate7c-rejected-lead-state.png` | Page-level — muted opacity + reason banner |
| 8 | An enrichment-pending lead (`score != null && enriched_at == null`) | Desktop | `gate7c-enrichment-pending-banner.png` | Page-level — request-enrichment banner |

## Pass criteria

- **Houston flagship Quick Facts:** Owner = `Texas Department of Transportation` (STATE AGENCY teal chip), Prime = `Brasfield & Gorrie`, Value = `$12.4M`, NAICS = `237310 · Highway, Street, and Bridge Construction`, Stage = `RFP open`, Timing = `06-01-26 – 04-30-27` with `~11 months` subtitle, Location = `Houston, TX` + coords, Permit = `—` (state agency, not federal — `Not disclosed (federal contract)` is federal-only), Lot Size cell **HIDDEN** (linear infra NAICS).
- **Cross-Pollination:** Title `Warm intro available — N matches` with magenta diamond accent. Brasfield + Big-D rows visible with EXACT solid-magenta chips. Per-match outreach hook in italicized blockquote. "Open in Outreach with this hook" button enabled.
- **Decision Bar:** Verdict line color matches tone (white Strong fit / amber Speculative / red Pre-bid closing / dim Pending). Primary CTA + Send via Gmail + Send via Outlook all visible. CTA label matches stage rule.
- **Recommended Action:** Section visible (not null) — extracted action sentence containing `warm intro` per `parse-rationale` heuristic on the canonical TxDOT rationale.
- **Mobile:** Quick Facts grid is 1 column, no horizontal scroll. Decision Bar wraps gracefully.
- **Rejected lead:** Page renders with `opacity: 0.6`. Top-of-page banner reads `Lead rejected — <reason>` with timestamp.
- **Enrichment-pending lead:** Banner above QuickFactsGrid reads `This lead has a score but hasn't been enriched yet — Request enrichment`.

## Hard halt — if any of

- Quick Facts cell shows wrong value vs. spec acceptance text
- Cross-Pollination card missing any of the 12 Gate-2 matches
- Houston flagship Recommended Action section is blank or shows monolithic fallback (parse-rationale failure)
- Mobile viewport produces horizontal scroll
- Rejected page renders at full opacity (banner present but state not muted)
- Bundle delta in preview build logs exceeds 100 KB (already pre-checked locally: **+6.3 KB at PR open** — should match)
- Any console error on page load

If any: STOP, file an issue, do NOT proceed to Gate 7D production flag flip.

## Bundle-size delta (pre-checked locally at Gate 7C PR open)

```
pre-7A baseline (origin/main 2be40e4):
  /leads/[projectId]   7.11 kB per-route   98.7 kB First Load

post-7C (this branch):
  /leads/[projectId]  13.4 kB per-route    105 kB First Load

Delta: +6.3 kB per-route  (94% under 100 KB hard halt threshold)
       +6.3 kB First Load
```

## Post-capture handoff

When all 8 PNGs are present in this directory:

1. `git add MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/gate7c-*.png`
2. Commit: `chore(demo): gate 7C preview-deploy screenshots — Houston flagship + sparse + rejected + enrichment-pending`
3. Push (amend onto gate7c branch if still open, or follow-up PR)
4. Update operator-todo `2026-05-04-pathfinder-gate7c-wiring-preview-verification.md` → status In Process → Done with link to commit
5. Dispatch Gate 7D (production flag flip) per `2026-05-05-pathfinder-gate7d-production-flag-flip.md`
