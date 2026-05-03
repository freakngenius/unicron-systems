# PLAN — demo-polish-ux/gate7b-empty-states-decisionbar

Spec: `Company Docs/Specs/SPEC - Lead Detail Page UX Redesign.md`
Predecessor: Gate 7A (PR #96 merged at `origin/main` `55dc863`)
Branch: `demo-polish-ux/gate7b-empty-states-decisionbar`
Worktree: `Pathfinder-worktrees/demo-polish-ux-gate7b-empty-states-decisionbar/`
Test baseline: 983/983 (post Gate 7A); hard halt if `<983`

## Gate 7B scope

Replace 7A stubs with full implementations across 4 components + page-level empty states.

### 1. `parse-rationale.ts` — full extraction

Heuristic regex-based extraction (no LLM call — keeps it cheap, deterministic, testable). Extracts:

- **action** — first sentence beginning with an imperative verb (`Call`, `Reach out`, `Schedule`, `Propose`, `Send`, `Coordinate`, `Connect`, `Walk`, `Open`, `Email`) OR first sentence containing recommendation phrases (`natural warm intro`, `recommended action`, `next step`, `worth a`, `the right move`). Cap at 2 sentences.
- **buyingContact** — phrase matching `<Person> at <Org>` or `the <role> at <Org>` patterns. Roles: VP, manager, director, officer, head, lead, principal, partner.
- **timingPressure** — date / deadline phrases: `<N> days`, `by <month> <day>`, `before <date>`, `RFP closes <date>`, `response window`, `bid window`, `pre-budget`, `pre-bid`.
- **fitWithProductMix** — sentences containing `wedge`, `fit`, `scope`, `outpriced`, `won` + product context.
- **marketSignalStrength** — sentences with `RFP`, `permit`, `announcement`, `corridor`, `bundle`.
- **geographicFit** — sentences with `miles`, `branch`, `coverage radius`, `region`, `nearest`.

If no `action` extracted, return `fallback: true` with `monolithic` populated. The parser never throws.

### 2. `DecisionBar.tsx` — verdict + CTA + Send buttons

**Verdict-line rules** (left side):

| Conditions | Verdict text | Color |
|---|---|---|
| `verified === true` AND `score ≥ 80` AND any cross-poll EXACT match | `Strong fit. Verified. <Customer> already serves the customer at N sites.` | white |
| `source === 'news'` AND `permit_number == null` | `Speculative. News mention only, no permit.` | amber |
| `source === 'sam.gov'` AND `estimated_start_date` (= responseDeadLine) within 30 days | `Pre-bid window closes in <N> days.` | red |
| `score == null` (Ranker hasn't run) | `Pending rank` | dim |
| else | `Score <N>` + `verified` + `warm intro` flags joined by `·` | white |

**Stage-aware CTA** (center):

| Conditions | CTA label |
|---|---|
| `permit_type` non-null AND `estimated_start_date` within 30 days | `Schedule site survey` |
| `source === 'sam.gov'` AND `prime_contractor_name == null` | `Wait for award notice` |
| else | `Open in Outreach` |

CTA `onClick` scrolls to the EmailComposer section via `document.getElementById('lead-email-composer')`. For `Wait for award notice`, the button is informational (no-op click, with a `disabled` cursor).

**Send buttons** (right side): `Send via Gmail` / `Send via Outlook`. Same UX position as current EmailComposer's send button. They scroll to + focus the EmailComposer body (the actual send logic stays in EmailComposer; DecisionBar is a navigation surface for the spec's "visible always" requirement).

### 3. `CrossPollinationCard.tsx` — full lift

Lift the rendering from `ZedcorRelationshipContext` into `CrossPollinationCard`. The new component owns the demo signature beat in the redesigned page; the legacy component stays in place to keep the pre-redesign layout (`redesignEnabled === false`) untouched.

Per-match row format (per spec § 4):

```
<customer_name> · <confidence chip> · <branch_name> · <distance> mi · <n_active_sites>
```

- Confidence chip: `EXACT` solid magenta border + faded magenta background; `FUZZY` dashed magenta border. Color: `#d946ef` (matches map line treatment from Gate 2 + the Owner-chip PE_FIRM color in QuickFactsGrid for visual consistency).
- Inline outreach hook from `lead_cross_pollination.outreach_opening_hook` (already in the type if present, otherwise hard-code the engine's hook field name). Italicized, blockquote-styled.
- "Open in Outreach with this hook" link — calls `onInsertHook(hook: string)` callback prop. LeadDetail's `RedesignedBody` provides the callback by lifting the EmailComposer's body state up. (Architecture validation; full per-match hook wiring stays minimal.)

Hide entirely when `matches.length === 0` (already correct in stub).

### 4. Page-level empty states (LeadDetail.tsx `RedesignedBody`)

Per spec § "Empty states (page-level)":

- **Lead has no rationale** (`project.rationale == null`): suppress `RecommendedAction` (already null-renders), suppress `ScoreBreakdown` (no component-level data), DecisionBar shows `Pending rank` (already wired).
- **Lead has score but no enrichment** (`project.score != null && project.enriched_at == null`): render a banner above QuickFactsGrid with a `Request enrichment` link. The link `POST /pathfinder/api/enrichment/request?project_id=X` is OUT OF SCOPE for 7B (no API yet) — render the link as `<a>` with an `onClick` that no-ops + alerts "Request enrichment endpoint pending Gate 8" so the affordance is visible without false promise.
- **Lead is rejected** (`project.rejection_reason != null`): wrap the entire page in a faded/muted state (opacity 0.6 on main content) + render a banner at the top explaining the rejection reason. All sections still readable.

### 5. RecommendedAction wire

Now that `parse-rationale` returns extracted fields, the existing render path in `RecommendedAction.tsx` (Gate 7A wrote it but it was unreachable) becomes live. No code change to `RecommendedAction.tsx` required — only the parse-rationale upgrade unlocks it.

### 6. ProjectStory wire

Same — the structured `parsed.fitWithProductMix` / `marketSignalStrength` / `geographicFit` rendering becomes live. ProjectStory falls back to monolithic when those fields are still null (e.g., the heuristic only extracted `action` but not the structured trio).

## File scope

New / modified:
- `Pathfinder/lib/leads/parse-rationale.ts` — full impl
- `Pathfinder/components/lead/DecisionBar.tsx` — full impl (replace stub)
- `Pathfinder/components/lead/CrossPollinationCard.tsx` — full impl (replace stub)
- `Pathfinder/components/lead/LeadDetail.tsx` — wire callback for hook insertion + add rejection banner + add enrichment-request banner
- `Pathfinder/tests/parse-rationale.test.ts` — extend with extraction cases
- `Pathfinder/tests/decision-bar.test.tsx` — new
- `Pathfinder/tests/cross-pollination-card.test.tsx` — new
- `Pathfinder/tests/lead-detail-empty-states.test.tsx` — new

Out of scope (deferred to 7C):
- ScoreBreakdown DB read
- Bundle-size + LCP measurement (deferred to 7C preview verification)
- Vercel preview env flip (Gate 7C)
- Production flag flip (Gate 7D)

## Verification plan

- `pnpm typecheck` → 0 errors
- `pnpm lint` → clean
- `pnpm test` → ≥ 983 + new (target ~1010-1020)
- TxDOT flagship rationale (from `scripts/backfill.ts:88`) extracts an `action` containing `warm intro` (per spec criterion #3 — extracted, not invented)

## Hard halts

Wake Kyle if:
- Houston flagship Quick Facts cells render wrong values (no risk in 7B — QuickFactsGrid not modified)
- Cross-Pollination card loses any of the 12 Gate-2 matches (test: render with 12-match fixture and assert all rendered)
- Acceptance criteria 1–6 fail
- Bundle adds >100 KB (deferred measurement to 7C, but flag here if scaffolding bloat is obvious)
- parse-rationale returns wrong action for TxDOT flagship (canonical test case — `warm intro` substring must appear)
- Test count drops below 983
- New components introduce >5% LCP regression (deferred to 7C measurement)

## Commit checkpoints

1. PLAN doc
2. parse-rationale full + test extension
3. DecisionBar full + test
4. CrossPollinationCard full + test
5. LeadDetail empty-states wire + test
6. (Final commit: any cleanup; push opens PR)
