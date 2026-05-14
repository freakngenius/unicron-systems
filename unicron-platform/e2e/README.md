# Metacron E2E — Playwright headless demo-path verifier

## What this is

Headless click-through verification for the Metacron operator demo path. Catches
the class of bugs that the unit-test suite cannot — white-screen crashes,
invisible white-on-white CTAs, dead-anchor redirects, wrong post-Approve
routing. Per `Company Docs/Metacron/SPEC - Definition of Done - End-to-End
Operational.md` the human-clickable demo path is the acceptance gate alongside
the 11-step synthetic smoke.

## Running

```bash
# Local dev
npm run dev                      # in one terminal
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run e2e

# Vercel preview
PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
  PLAYWRIGHT_BASIC_AUTH=user:pass \
  npm run e2e

# Production
PLAYWRIGHT_BASE_URL=https://unicron.systems npm run e2e
```

## Browser install

```bash
npm run e2e:install
```

CI installs chromium via the `@playwright/test` dev dependency on first run.

## Environment

| Var                            | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`          | Target URL (defaults to `http://localhost:5173`)           |
| `PLAYWRIGHT_BASIC_AUTH`        | `user:pass` for Vercel preview Basic-auth protected hosts  |
| `PLAYWRIGHT_OPERATOR_COOKIE`   | Seeded operator session cookie — unlocks auth-gated steps  |

## What's covered today

- Step 0: root renders, no white screen, no `toUpperCase` console error
- Sign-in CTA: blue background, white text (seam #2 regression guard)
- No global `pageerror` on initial render

## What's deferred (needs auth)

Steps 1-9 of the full demo path (Onboarding → Architect → Approve → Customers
→ Detail → Open Pathfinder → tailored Pathfinder render → lead verification)
require an authenticated operator session. The `Authenticated demo path`
test.describe block is gated on `PLAYWRIGHT_OPERATOR_COOKIE` and skipped with a
clear reason otherwise so CI does not false-pass.

Wiring those steps requires either:
1. Seeded session cookie from `pathfinder.operator_allowlist` (preferred)
2. A test-only `?e2e=1` bypass on `SignInGate` (only in non-prod builds)

Both are tracked in the demo-path repair sprint.
