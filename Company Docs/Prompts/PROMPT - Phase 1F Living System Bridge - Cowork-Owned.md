# PROMPT — Phase 1F Living System Bridge (Cowork-owned, ship-now-merge-later)

Paste into a fresh Claude Code session. Build on feature branch now. Migration applied with Kyle review gate. PR opened. Do not merge to main until Pathfinder peer 6mz1zgdf clears the schema slot (expected Wednesday post-Zedcor demo).

---

## Context

Phase 1F bridges operator verification (Metacron, `unicron.agent_dispatches`) to customer activity feed (Pathfinder, `pathfinder.agent_verifications`). Operator clicks Verify in Metacron → row written to both schemas → Pathfinder customer dashboard ticker updates within ~1s without refresh via Supabase Realtime.

This is Path B (cross-schema single PR) because the two ends are inseparable for the bridge to function. Pathfinder Cowork is at capacity for Zedcor demo polish through Tuesday. Metacron Cowork is taking ownership.

## Hard constraints

- No deletes (rm, git clean, reset --hard, wipe uncommitted work). Archive instead. Commit before branch switch.
- No time estimates anywhere.
- No cost caps.
- Multi-Vercel verification: Pathfinder + Metacron independent.
- No promotion to Verified column (human-only).
- Verbatim evidence in PR description (logs, schema queries, screenshots).
- **Do not merge to main.** This PR sits open until Cowork explicitly authorizes merge after peer 6mz1zgdf confirms schema slot is clear.

## Phase A — Peer notification (no gate)

Send via claude-peers MCP to peer 6mz1zgdf:

```
Heads up: Metacron Cowork is shipping Phase 1F bridge now on a feature branch. Migration applied to production via Path B. PR will be open but NOT merged until you confirm the schema slot is clear post-Zedcor demo.

Migration adds: pathfinder.agent_verifications (new table, RLS, Realtime publication on pathfinder schema). Independent of organizations schema work; no column/table-name collision with anything you have queued.

After Tuesday Zedcor demo, please:
1. Confirm no schema conflict in your post-demo audit.
2. Greenlight Cowork to merge our PR.

Or push back if you see a conflict and we'll halt the merge.
```

Do not wait for ack. Proceed to Phase B.

## Phase B — Investigation (Explore sub-agent, very thorough)

```
Investigate to scope Phase 1F bridge:

1. Confirm pathfinder.agent_verifications, organizations, org_memberships do NOT exist in production (use list_tables + list_migrations).
2. Find Metacron's verifyDispatch implementation — file path, line range, current shape.
3. Find unicron.agent_dispatches schema — confirm it has customer_org_id column.
4. Find Pathfinder customer dashboard root component — where does ActivityTicker land?
5. Identify the existing Realtime subscription primitives in Pathfinder if any.
6. Confirm Supabase Realtime publication state for pathfinder schema (is it already exposed?).
7. Locate next available migration number via live list_migrations (max+1).
8. Confirm both Vercel projects' status pages green pre-work.
9. Report findings with file paths + line numbers + verbatim snippets.
```

## Phase C — Migration (HARD HALT for Kyle review)

Branch from main:

```bash
git checkout main && git pull origin main
git worktree add .claude/worktrees/phase-1f-bridge feat/phase-1f-living-system-bridge
cd .claude/worktrees/phase-1f-bridge
```

Create migration file `Pathfinder/supabase/migrations/<NNNN>_agent_verifications.sql` (live max+1):

```sql
-- Phase 1F Living System Bridge — pathfinder.agent_verifications
-- Cross-schema mirror of unicron.agent_dispatches at the moment of operator Verify.

CREATE TABLE IF NOT EXISTS pathfinder.agent_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL,                          -- references unicron.agent_dispatches.id (logical, no FK across schemas)
  customer_org_id text NOT NULL,                      -- text to match unicron.agent_dispatches.customer_org_id
  agent_name text NOT NULL,
  verified_by_user_id uuid NOT NULL,
  verified_by_user_email text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pathfinder.agent_verifications (customer_org_id, created_at DESC);
CREATE INDEX ON pathfinder.agent_verifications (dispatch_id);

ALTER TABLE pathfinder.agent_verifications ENABLE ROW LEVEL SECURITY;

-- Customers read their own org's verifications.
-- (Pre-Phase-2A: customer_org_id-scoped read for any authenticated user. Will be tightened in Phase 2A via org_memberships JOIN.)
CREATE POLICY "customers read own org verifications"
  ON pathfinder.agent_verifications FOR SELECT
  USING (true);  -- Phase 2A replaces with org_memberships filter

-- Service role full access.
CREATE POLICY "service role all"
  ON pathfinder.agent_verifications FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Realtime publication on pathfinder schema.
-- If publication already exists for the schema, this is additive.
ALTER PUBLICATION supabase_realtime ADD TABLE pathfinder.agent_verifications;
```

**HARD HALT FOR REVIEW**: print the full migration SQL in chat output. Wait for Kyle's explicit "apply" reply before calling `apply_migration`. Do not auto-apply.

After Kyle authorizes: `apply_migration` with the SQL above. Then re-check via `execute_sql` that the table exists with expected columns.

## Phase D — Pathfinder ActivityTicker

In `Pathfinder/components/ActivityTicker.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Verification {
  id: string;
  agent_name: string;
  verified_by_user_email: string;
  summary: string;
  created_at: string;
}

interface Props {
  customerOrgId: string;
  limit?: number;
}

export function ActivityTicker({ customerOrgId, limit = 10 }: Props) {
  const [items, setItems] = useState<Verification[]>([]);
  const supabase = createClient();

  useEffect(() => {
    // Initial fetch.
    supabase
      .schema('pathfinder')
      .from('agent_verifications')
      .select('*')
      .eq('customer_org_id', customerOrgId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (data) setItems(data);
      });

    // Realtime subscription.
    const channel = supabase
      .channel(`agent_verifications:${customerOrgId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'pathfinder',
          table: 'agent_verifications',
          filter: `customer_org_id=eq.${customerOrgId}`
        },
        (payload) => {
          setItems((prev) => [payload.new as Verification, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [customerOrgId, limit, supabase]);

  if (items.length === 0) return null;

  return (
    <div className="activity-ticker">
      {items.map((item) => (
        <div key={item.id} className="ticker-item ticker-item-enter">
          <span className="agent">{item.agent_name}</span>
          <span className="summary">{item.summary}</span>
          <time>{new Date(item.created_at).toLocaleString()}</time>
        </div>
      ))}
    </div>
  );
}
```

Wire into Pathfinder customer dashboard root. Pull `customerOrgId` from existing customer context (Zedcor uses hardcoded value pre-Phase-2A; that's fine for now).

Add CSS animation for new entries (slide-in or fade).

Component test (Vitest + RTL): renders entries, subscribes to channel, prepends on insert event.

## Phase E — Metacron verifyDispatch dual-write

Find existing `verifyDispatch` function in `unicron-platform/`. Extend to write to both schemas:

```typescript
async function verifyDispatch(dispatchId: string, summary: string) {
  // 1. Update unicron.agent_dispatches (existing behavior).
  const { data: dispatch, error: e1 } = await supabase
    .schema('unicron')
    .from('agent_dispatches')
    .update({
      verified_by_user_id: user.id,
      verified_at: new Date().toISOString(),
      status: 'verified'
    })
    .eq('id', dispatchId)
    .select()
    .single();
  if (e1) throw e1;

  // 2. Write pathfinder.agent_verifications (Phase 1F bridge).
  const { error: e2 } = await supabase
    .schema('pathfinder')
    .from('agent_verifications')
    .insert({
      dispatch_id: dispatchId,
      customer_org_id: dispatch.customer_org_id,
      agent_name: dispatch.agent_name,
      verified_by_user_id: user.id,
      verified_by_user_email: user.email,
      summary
    });
  if (e2) {
    // Bridge write is non-blocking. Log but do not throw.
    console.error('agent_verifications write failed:', e2);
  }

  return dispatch;
}
```

Update existing tests for `verifyDispatch` to assert both writes happen on success path. Add test for the failure-tolerant path (pathfinder write fails → unicron write still succeeds, function still returns successfully, error logged).

## Phase F — E2E smoke test

Manual verification before opening PR:

1. Run Metacron locally pointed at production Supabase.
2. Pick a Zedcor agent dispatch, click Verify in Metacron UI.
3. Open Pathfinder customer dashboard in another browser tab, scoped to Zedcor.
4. Confirm Activity Ticker entry appears within ~1s without refresh.
5. Confirm row in `pathfinder.agent_verifications` via `execute_sql`.
6. Capture screenshots of: Metacron verify click, Pathfinder ticker update, SQL row.

If E2E fails, halt and report. Do not push the branch.

## Phase G — PR open (NOT merged)

1. Push branch.
2. PR titled `Phase 1F: Living System Bridge — operator Verify → customer ticker (Path B, cross-schema)`.
3. PR body must include:
   - What ships (bullet list).
   - **Path B justification**: Pathfinder Cowork at capacity for Zedcor demo; Metacron Cowork absorbing per Kyle direction. Cross-app boundary acknowledged.
   - **Migration drift callout**: live max+1 used; local files trail prod.
   - **Peer notification**: timestamp of message sent to 6mz1zgdf; their reply if any (otherwise "no reply yet, awaiting Wednesday post-Zedcor confirmation").
   - **Merge gate**: this PR is intentionally NOT merged. Awaiting peer 6mz1zgdf confirmation that schema slot is clear post-Zedcor demo. Cowork will authorize merge.
   - E2E smoke screenshots.
   - Multi-Vercel preview links and statuses (both green expected).
   - Risk + rollback (revert PR; migration is non-destructive new table; ActivityTicker is additive; verifyDispatch failure-tolerant).
4. CI green required. If red, fix on branch.
5. **Do not call `gh pr merge`.** Stop after PR is open and CI green.

## Phase H — Standby

After PR open and CI green:

1. Worktree stays mounted (do not remove).
2. Branch stays pushed (do not delete).
3. CC reports: PR URL, migration applied confirmation, both Vercel preview URLs, E2E smoke evidence summary.
4. Wait for Cowork to relay merge authorization (post-Zedcor demo, peer 6mz1zgdf confirms).
5. On authorize: `gh pr merge <PR> --squash --delete-branch`. Then multi-Vercel verify production deploys, worktree cleanup, kanban hygiene reporting (Cowork moves cards).

## Failure modes — halt + report

- Phase B finds pathfinder.agent_verifications already exists (peer started without telling us) — halt, surface, do not duplicate work.
- Migration apply fails (Supabase error, schema state different than expected) — halt, surface SQL state.
- E2E smoke fails — halt before push.
- Either Vercel preview red — halt.
- Peer 6mz1zgdf replies with hard pushback ("we have schema in flight that conflicts") — halt the merge approval flow, surface to Cowork.

## Kanban hygiene

- Phase B start: Cowork moves Phase 1F card → In Process (both Metacron-side and Pathfinder-side cards if they exist).
- PR open + CI green: Cowork moves card → Review (not Deployed yet — not merged).
- Merge authorized + executed: Cowork moves card → Deployed. CC reports merge SHA + ISO timestamp.
- Verified column: human-only. Kyle moves after E2E demo lands.

End.
