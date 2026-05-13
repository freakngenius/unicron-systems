# Gate 13Z — Stripe Billing (Wave 4 stream Z)

Branch slug: `wave4/gate13z-stripe-schema` (this PR is 13Z-A only).

Goal: stand up paid-launch monetization. Subscription tiers, Checkout flow, Customer Portal, webhook handler, usage tracking, per-tier quota enforcement.

This PR delivers **only 13Z-A** — schema + Stripe client seam + env stubs + operator-setup doc. **DO NOT MERGE PRE-DEMO.** Tuesday 2026-05-05 Zedcor demo takes precedence; merge window opens Wednesday.

## Hard constraints (inherited by all 13Z sub-gates)

Distilled from Gates 7 / 8 / 9 / 10 / 11 / 12 demo-polish-ux live-status logs and Pathfinder/CLAUDE.md.

1. **Schema additive only.** `create table if not exists`, `alter add column if not exists`. Never `drop`, never destructive `alter`. Migrations re-runnable.
2. **No `rm`, `git clean -f`, `git reset --hard`** (or any destructive filesystem op) outside declared file scope. Use `git stash push -u` for tidy-up.
3. **Commit before branch switches.** Long-uncommitted work is the most fragile state in the system.
4. **Secrets never in client bundle.** All Stripe SDK calls server-side only. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and price IDs read via `process.env.*` in server code or route handlers, never in `'use client'` files.
5. **Flag default off for any new feature.** Billing UI page renders behind a `BILLING_ENABLED` env check (introduced in 13Z-B). Production rendering unchanged until flag flipped.
6. **Houston flagship preserved.** No regression to QuickFactsGrid, Cross-Pollination, ZedcorRelationshipContext rendering. 13Z does not touch lead-detail surface.
7. **`agent_runs` writes untouched.** Quota enforcement (13Z-D) wraps callers; the underlying agent loop continues writing `agent_runs` rows unmodified.
8. **Tests ≥ current baseline.** As of Gate 7B the floor is **1043 passed | 24 skipped**. Verify post-12 baseline before opening 13Z-B; treat any decrease as regression.
9. **Worktree-only.** Every sub-gate ships from `Pathfinder-worktrees/gate13z-<slug>/`. Never edit the main `/Pathfinder/` directory.
10. **Never merge own PR.** PR-per-gate, normal Kyle review. Auto-merge is **DISABLED** for stream Z by operator decision (Stripe touches live keys + real charges → human-in-the-loop required).
11. **Stripe live keys gated.** Test-mode keys only for dev. Live mode requires explicit Kyle approval surfaced in the operator-todo before flipping any env var.

## Sub-gate roadmap

| Gate | Branch | Status | Blocks on |
|------|--------|--------|-----------|
| **13Z-A** | `wave4/gate13z-stripe-schema` | **THIS PR — open, hold for Wed merge** | — |
| 13Z-B | `wave4/gate13z-checkout` | queued (post-demo) | 13Z-A merged + `pnpm add stripe` + Stripe Dashboard products created |
| 13Z-C | `wave4/gate13z-webhook` | queued (post-demo) | 13Z-A + 13Z-B (price IDs in env) |
| 13Z-D | `wave4/gate13z-quota` | queued (post-demo) | 13Z-C (subscription rows being written by webhook) |
| 13Z-E | `wave4/gate13z-stripe-setup-doc` | partial — operator-todo lives in this PR; Dashboard side is a Kyle action item | — |
| 13Z-F | production verification | queued | 13Z-D + Kyle's live-key approval |

## 13Z-A scope shipped (this PR)

**Files added:**

- `Pathfinder/supabase/migrations/0121_subscriptions.sql` — additive migration for `customer_orgs`, `subscriptions`, `billing_events`, `usage_events`. Stream-Y compatible (`create table if not exists` on `customer_orgs` allows Stream Y's 0119 to land in either order).
- `Pathfinder/lib/stripe/types.ts` — `Tier`, `SubscriptionStatus`, `UsageEventType`, `TierLimits`, `TIER_LIMITS`, `TIER_PRICING_USD`, `SubscriptionRow`. Decoupled from `stripe` npm package so this compiles before the SDK is installed.
- `Pathfinder/lib/stripe/client.ts` — `STRIPE_ENABLED` flag, `StripeNotConfiguredError`, stubs for `getStripeClient()`, `getPriceIdForTier()`, `getWebhookSecret()`. 13Z-B replaces the stubs with real SDK calls.
- `Pathfinder/.env.example` — Stripe section appended with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, plus comments on test vs. live mode.
- `MEMORY/operator-todos/2026-05-03-stripe-setup.md` — Kyle-side setup checklist (Dashboard products, webhook endpoint registration, env var population, test-mode → live-mode promotion).

**Not in this PR (deferred to later sub-gates):**

- `pnpm add stripe` (deferred to 13Z-B — keeps lockfile diff out of schema PR)
- `app/api/billing/checkout/route.ts` (13Z-B)
- `app/api/billing/portal/route.ts` (13Z-B)
- `app/api/stripe/webhook/route.ts` (13Z-C)
- `lib/quota/check.ts` + wiring into ranker / enricher / contact-enricher / outreach / tower-estimator (13Z-D)
- Billing UI page at `/pathfinder/billing` (13Z-B)
- Quota-reached UI surfacing on lead list / actions (13Z-D)

## Stream-Y / Stream-Z `customer_orgs` agreement

Per operator: Stream Y's 0119_users_teams will own the rich `customer_orgs` shape (owner_user_id, billing_email, plan flags, etc). Stream Z owns the **minimal intersection** that lets `subscriptions.customer_org_id` resolve. Both migrations use `create table if not exists` and `alter add column if not exists` so order of arrival is irrelevant. No FK conflict. No coordination cost.

## Verification (13Z-A)

```
$ pnpm typecheck   → expected: 0 errors
$ pnpm lint        → expected: no warnings or errors
$ pnpm test        → expected: ≥ post-Gate-12 baseline (no new tests in 13Z-A; types-only changes)
```

13Z-A introduces no runtime imports of `stripe` and no new tests. Acceptance is type-clean compilation + the migration applying cleanly against a fresh database (operator step, post-merge).

## Hard-halt items not tripped (13Z-A)

- ✅ Schema additive only — all four tables `if not exists`, all indexes `if not exists`
- ✅ No client-bundle exposure — `lib/stripe/*` is server-only; nothing exported from a `'use client'` boundary
- ✅ `stripe` npm package NOT installed in this PR (no lockfile churn)
- ✅ No production code path touched — there are no callers of `getStripeClient()` yet
- ✅ Auto-merge disabled — title carries `[DO NOT MERGE PRE-DEMO]`
- ✅ Test baseline preserved — no test changes; baseline floor inherited from Gate 12
- ✅ Houston flagship rendering unchanged — no lead-detail edits
- ⏸ Migration applied against staging — deferred to operator merge step
- ⏸ Stripe Dashboard product / price configuration — Kyle action, see operator-todo
