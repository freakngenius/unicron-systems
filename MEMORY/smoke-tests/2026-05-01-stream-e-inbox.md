# Stream E Smoke — E3 Tier 2 Inbox

**Status:** BLOCKED at live HTTP step. Same root causes as E1.

## What I confirmed at the DB level
- `pathfinder.architect_inbox` table created by migration 0080. CHECK constraints accept `category in ('source-discovery','architect-proposal','coverage-expansion')`, `status in ('open','acknowledged','in_progress','resolved','dismissed')`, `priority in ('low','medium','high')`.
- FKs to `architect_sessions(id)` and `data_sources(id)` (both `on delete set null`) resolve.

## What I did NOT do
- Did NOT manually insert a Tier 2 ticket via SQL — the spec said to do this and verify resolve/defer/escalate flows, but the resolve endpoint is HTTP-gated behind basic auth, so the resolve/defer/escalate part of the test was unreachable. Inserting a row I can't then exercise via the resolve endpoint felt like noise; I prefer to do the full E3 flow in one pass once the deploy is unblocked.

## What unblocks the live smoke
Same as E1 — Vercel deploy + basic-auth creds. Suggested sequence once unblocked:
```
# 1. Insert a synthetic Tier 2 ticket
insert into pathfinder.architect_inbox(category, title, blocked_reason, blocked_detail, what_human_needs_to_do, context, priority, status)
values('source-discovery', 'JS-rendered SPA test', 'js_rendering', 'Source uses client-side rendering', 'Capture rendered HTML', '{"candidate_url":"https://example.com/data"}'::jsonb, 'medium', 'open')
returning id;

# 2. List via API
curl -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASS" 'https://pathfinder-kekas-projects-89ac4317.vercel.app/pathfinder/api/architect/inbox/tickets?category=source-discovery'

# 3. Resolve flows (one ticket each):
#    - manual resolve
curl -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASS" -H 'content-type: application/json' \
  -d '{"mode":"manual","resolution_note":"resolved during smoke"}' \
  'https://pathfinder-kekas-projects-89ac4317.vercel.app/pathfinder/api/architect/inbox/tickets/<id>/resolve'
#    - defer (and verify resume)
#    - escalate
```
