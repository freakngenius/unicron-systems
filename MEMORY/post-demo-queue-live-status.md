# Post-demo queue — live status

Append-only operational log. Newest entry on top.

---

## 2026-05-02 22:15 UTC — Wednesday post-demo sweep — Phase C complete (Gates 2, 4, 5, 6 done; 1 + 3 deferred)

Override-mode execution per Kyle. Phase A (10-PR rebase + merge) and
Phase B (pre-flight) completed earlier. Phase C ran the post-demo
gates that don't require external operator action.

### Phase A — stack merge recap

Main HEAD progressed: `09ab36a` → `2be40e4` over the sweep (other
streams from sister chats interleaved). All 10 demo polish PRs merged
to main:

```
ae588a4  Gate 3A schema + spec  (PR #78)
705921d  Gate 3C enrichment (folds #79 content)  (PR #81)
0e0525b  Gate 3D ProjectFactsCard + Posted reformat  (PR #82)
17fa73d  Gate 3E verification + LA re-run support  (PR #83)
07bf751  Gate 4A Slack + Resend probes  (PR #85)
10a9816  Gate 4B-1 HubSpot webhooks + outbound  (PR #86)
f0659a2  Gate 4B-2 HubSpot mapping UI  (PR #88)
6922396  Gate 4B-3 HubSpot recon  (PR #90)
09ab36a  Gate 5 demo dry-run plan  (PR #91)
```

PR #79 was force-merged into its parent branch (gate3a-schema-spec)
during the first naive merge attempt; its content was recovered via
PR #81's rebased squash to main. PR #79 stays MARKED merged on GitHub
with a recovery-note comment for audit hygiene.

### Phase B — pre-flight

| Check | Result |
|---|---|
| main HEAD = post-stack | ✅ post-merge state at `09ab36a`+ |
| Vercel Pathfinder main | ✅ READY |
| agent_runs writing | ✅ outreach=2, ranker=2 in trailing hour |
| Houston flagship | ✅ DB row populated; ProjectFactsCard live |
| INNGEST_EVENT_KEY | ⚠️ unverifiable (no Vercel-env-listing MCP); halt only Gate 3 |

### Phase C — post-demo gates

#### Gate 1 — HUBSPOT_RECON_APPLY=1 flip (DEFERRED)

Kyle's prompt premise was "Tuesday demo's HubSpot recon ran cleanly in
dry-run mode." That premise didn't hold during this sweep because the
Tuesday demo didn't actually happen — the Wednesday sweep is being run
**before** Tuesday by an autonomous override. Defer to actual
post-demo ops.

#### Gate 2 — NAICS code/description coupling — ✅ shipped

PR #94. Pair-or-neither rule in `applyAnthropic`. Backfill executed
against 43 enriched leads: 16 changed, 27 unchanged, 0 errors,
$0.1825 cost. Houston flagship NAICS now consistent (Anthropic's
choice of 561621 / Security Systems Services — see PR body for the
237310-vs-561621 narrative call Kyle needs to make).

#### Gate 3 — Coverage Expansion Inngest re-run (DEFERRED)

INNGEST_EVENT_KEY not verifiable from this session. Per prompt rule:
"halt only Gate 3 if env var missing/unverifiable, proceed with the
others."

#### Gate 4 — recorder ↔ session telemetry linkage — ✅ shipped

PR #95. Three-part fix:
- Migration 0111 added FK `llm_calls.session_id → architect_sessions.id`
  with ON DELETE SET NULL. Applied to live Supabase.
- `finalizeSession` now aggregates `total_cost_usd` + `total_llm_calls`
  from llm_calls keyed by session_id (instead of trusting an in-memory
  counter that nothing was incrementing).
- Backfill script linked + refinalized 4 historical sessions; all 4
  went from `total_cost_usd=0` → real values (architect-tuning $0.0471,
  3× coverage-expansion $0.0003-0.0008).

#### Gate 5 — Reply detection (In Process card) — ✅ triaged → DEPLOYED

Investigation result: card status is stale. Reply detection is
**code-complete**:

- `app/api/email/webhooks/gmail/route.ts` (130 lines) — Gmail Pub/Sub
  push receiver, decodes base64 historyId payload.
- `app/api/email/webhooks/outlook/route.ts` (161 lines) — Microsoft
  Graph change-notification webhook with validation handshake.
- `app/api/email/webhooks/inbound/route.ts` (69 lines) — generic
  inbound dispatcher.
- `lib/email/threads.ts` `recordOutboundThread` + `handleInboundReply`
  helpers; deal-stage transition CONTACTED → REPLIED + deal_activities
  insert.
- 4 dedicated test files: `__tests__/email/threads.test.ts`,
  `__tests__/email/webhooks.test.ts`,
  `__tests__/api/email/webhooks-inbound.test.ts`,
  `__tests__/api/email/webhooks-outlook.test.ts`.

Code shipped in PR #34 (Stream B Phase 2 CRM extensions, 2026-04 era).
No TODOs in the files; no obvious gaps.

**Recommendation for Kyle:** move the kanban card from "In Process"
→ "Deployed" (or "Verified" once Kyle has verified live via a real
Gmail Pub/Sub subscription configured in Google Cloud Console + an
Outlook subscription registered against a tenant). The remaining work
is operator-side configuration of the upstream subscriptions, not
code.

#### Gate 6 — Chat-renderer syntax highlighting (Bug Fixes card) — ✅ triaged → wontfix

Investigation result: the Shiki bundle-size concern from PR #42 is
already mitigated by the current implementation's lazy-loading
pattern.

`components/chat/markdown/CodeBlock.tsx`:

```ts
function loadHighlighter(): Promise<Highlighter> {
  if (cachedHighlighter) return Promise.resolve(cachedHighlighter);
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = import('shiki').then(...);
  ...
}
```

Dynamic `import('shiki')` means Shiki ships in a separate chunk that
only loads when the chat first emits a code fence. The synchronous
fallback (`<pre><code>` no highlighting) renders during the async
boot. The cached highlighter avoids re-loads.

**Recommendation for Kyle:** close the card as `wontfix — bundle
budget acceptable`. Migrating to lowlight at this point would require
re-implementing the language coverage + GitHub-light theme, plus
rewriting the existing `__tests__/chat-renderer/MarkdownRenderer.test.ts`
suite, with no measured benefit (Shiki isn't in the main bundle).
If a future bundle audit shows a concrete regression, revisit then.

### Cumulative cost across Phase C

- Gate 2 NAICS revalidation (live Supabase + Anthropic): **$0.1825**
- Gate 4 backfill (Supabase only, no LLM calls): **$0**
- Gates 5 + 6 triage memos: **$0**
- **Total Wednesday post-demo cost: $0.1825**

### Hard-halt items not tripped (cumulative)

- ✅ Schema additive only (Gate 4 added FK + index; Gate 2 was data-only).
- ✅ No auth boundary changes.
- ✅ No HubSpot scope expansion.
- ✅ Houston flagship visible. Cross-pollination overlay untouched.
- ✅ agent_runs writes flowing (regression check passed).
- ✅ Pipeline (ingestor / ranker / verifier / outreach) operational.
- ✅ NAICS revalidation < 50% of corpus (16 / 43 = 37%).
- ✅ INNGEST_EVENT_KEY unverifiable: handled by Gate 3 deferral, not
  blanket halt.

### PRs opened this sweep

- [#94](https://github.com/freakngenius/unicron-systems/pull/94) — Gate 2 NAICS coupling fix
- [#95](https://github.com/freakngenius/unicron-systems/pull/95) — Gate 4 recorder↔session telemetry linkage
- this PR — combined Gate 5 + Gate 6 triage memos

### Operator-todo (Kyle)

1. Review + merge PR #94 (Gate 2 NAICS) — note the TxDOT classification
   choice in the PR body.
2. Review + merge PR #95 (Gate 4 telemetry) — migration 0111 already
   applied to live Supabase.
3. Move Pathfinder kanban "Reply detection (inbound email webhooks)"
   card In Process → Deployed (or Verified once you've done a live
   Gmail Pub/Sub subscription).
4. Close Pathfinder kanban "Chat-renderer code syntax highlighting
   (lowlight)" card as wontfix — bundle budget acceptable.
5. Confirm `INNGEST_EVENT_KEY` env var presence in Pathfinder Vercel
   project, then dispatch Gate 3 (Coverage Expansion Inngest re-run)
   in a follow-up session.
6. Validate the Gate 1 premise (Tuesday demo recon dry-run was clean)
   before flipping `HUBSPOT_RECON_APPLY=1`.
