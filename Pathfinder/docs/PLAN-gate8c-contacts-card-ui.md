# PLAN — Gate 8C: ContactsCard UI + LeadDetail wiring + empty states

Branch: `demo-polish-ux/gate8c-contacts-card-ui`
Spec: `Company Docs/Specs/SPEC - Contact Enrichment.md` § UI — Contacts Card
Base: `demo-polish-ux/gate8b-contact-providers-cron` (consumes `LeadContactRow` type + on-demand POST endpoint).

## Goal

Surface the decision-maker contacts the cron + orchestrator persist into `pathfinder.lead_contacts`. The UI is the demo payoff: the rep reads the card, copies an email, and pivots into outreach without leaving the page.

## Files in scope

In:
- `Pathfinder/components/lead/ContactsCard.tsx` — outer card; routing of populated / empty states.
- `Pathfinder/components/lead/ContactRow.tsx` — per-contact rendering: name, role, chips, email/phone/linkedin, copy actions, "Use as recipient".
- `Pathfinder/components/lead/LeadDetail.tsx` — slot ContactsCard between CrossPoll and RecommendedAction (redesign mode); above the grid (legacy mode); add `recipientOverride` bridge to EmailComposer.
- `Pathfinder/app/leads/[projectId]/page.tsx` — fetch `lead_contacts` rows; pass through; pass `isTopFifty` (score ≥ 50) and `isAdmin` (true; basic-auth restricts).
- `Pathfinder/lib/types.ts` — additive `LeadContactRow` type.
- `Pathfinder/tests/contacts-card.test.tsx` — 15 tests covering populated, all 4 empty states, copy actions, "Use as recipient", chips.

Out:
- The full `Sent history` log under EmailComposer (out of scope; Gate 7B left it deferred).
- "Show low-confidence" toggle UI (spec defers; ContactRow already filters source_confidence < 0.5).
- Gate 8D production rollout + Houston verification.

## Empty states

```
contacts.length > 0   →  populated list
otherwise:
  owner_name unknown / pre-award / rejected → "Contact lookup pending owner identification" (muted)
  isTopFifty                                  → "Enrichment pending — refresh in 5 min" + "Run now" (admin-only)
  !isTopFifty                                 → "Contacts not enriched (lead score below threshold)" + "Request enrichment" link
```

The ``noResults`` ("all-providers-empty") state isn't reachable from the current data model — when the orchestrator returns 0 with authoritative providers, the persistence layer wipes-and-inserts an empty set, leaving the row unmarked. This shows up as ``topFiftyPending`` with the operator able to ``Run now``. Distinguishing the two visually is a Gate 8D consideration; the empty-state code path is wired so future work can flip it on without UI churn.

## "Use as outreach recipient" wiring

ContactsCard fires `onSetRecipient(email, name)`. RedesignedBody lifts that into a nonce-bumped state and passes it down to EmailComposer as `recipientOverride={email, nonce}`. EmailComposer watches `nonce` (mirror of the existing `bodyOverride` pattern from Gate 7B) and calls `setRecipient(email)`. The composer scrolls into view on click.

The legacy (flag-off) layout doesn't wire `recipientOverride` because the legacy EmailComposer call site doesn't pass it; ContactsCard simply doesn't pass an `onSetRecipient` in legacy mode → "Use as recipient" stays disabled. That's acceptable: the legacy path is the pre-redesign flow which doesn't surface the redesigned ContactsCard prominently anyway.

## Spec deviations

1. **`isTopFifty` is approximated server-side from `project.score >= 50`** rather than a join against the contact-enricher's recent run set. The contact-enricher's selection runs nightly and is the actual top-50 source; the UI's only failure mode is showing "Run now" for a borderline lead. Acceptable.
2. **`isAdmin` is hardcoded `true` in the page route** because `middleware.ts` basic-auth restricts the page to operators. The prop is plumbed so per-rep auth can flip it without UI churn.
3. **Low-confidence row hiding lives in ContactRow** rather than ContactsCard — keeps the card semantically simple and lets the row self-suppress.

## Verification

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test` → 1125 passed (1110 baseline + 15 new), 0 regressions.

## Auto-merge gate criteria (per Gate 8 prompt)

- Before/after screenshots of LeadDetail with ContactsCard. Captured by Gate 8D's screenshot pass; this PR ships the UI scaffolding under feature flag `LEAD_DETAIL_REDESIGN=1` (already established by Gate 7A).

## PR base note

This PR is stacked on Gate 8B (PR #101). Github will rebase when 8B merges; if 8B's pre-condition env-var halt is still active, this PR can ship first because the UI code consumes only the `LeadContactRow` type (additive in 8B) and a row-fetch from `pathfinder.lead_contacts` (the table created in 8A — already live). With 8B's cron not yet set, the table stays empty and the UI renders the `topFiftyPending` empty state cleanly.

That said, opening this PR with base `main` requires re-applying the Gate 8B types. Cleaner: keep base `demo-polish-ux/gate8b-contact-providers-cron` so the diff is reviewable, and set GitHub auto-merge to wait on 8B. Documented for Kyle's review.
