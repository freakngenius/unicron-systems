# PLAN — P0-02b Outreach visible progress

**Branch:** `feat/p0-02b-outreach-visible-progress`
**Worktree:** `Pathfinder-worktrees/p0-02b-outreach-visible-progress/`
**Spec source:** Kyle's prompt 2026-04-28 — visible-progress follow-up to P0-02 Outreach Drafter (already shipped via PR #13, in production at commit `69c31c5`).
**Status:** Plan — approve before any code is written.

---

## 1. Goal

Make the Outreach Drafter visible in the dashboard UI without waiting for the Intelligence Chat (P0-01) inbox surface. After this lands, an operator looking at the dashboard can answer three questions at a glance:

- **Is the Outreach agent running and producing drafts?** — answered by a new cell in the Agent Status Row strip.
- **Which projects in my list already have drafts ready?** — answered by a small badge on the project row.
- **What are the actual drafts for this project?** — answered by a new `Outreach drafts` section in the Project Modal showing email + LinkedIn + voicemail copy.

Nothing else changes. No edit / send / regenerate buttons (those land with P0-01 Intelligence Chat). No outreach inbox view. No briefing-email update.

---

## 2. Honest scope estimate

Kyle described this as a "50-line PR." The pure component edits ARE small (about 50 lines). What pushes the real diff to ~200-250 lines is the data path: the components have nothing to render without a route that exposes `pathfinder.outreach_drafts` to the browser.

I'll need a thin API route plus a small client hook. I'm calling that out here and including it in the file scope — flag at review if you'd rather I take a different path (e.g., merge counts into `/api/projects` instead of a new route).

---

## 3. Scoped files (declared up front)

**New (additive only):**

- `app/api/outreach-drafts/route.ts` — single endpoint, two modes:
  - `GET /api/outreach-drafts` → `{ counts: Record<projectId, number> }` for ProjectList badges
  - `GET /api/outreach-drafts?project_id=<id>` → `{ drafts: OutreachDraft[] }` for ProjectModal section

  ~70 lines. Read-only. Uses the anon `supabase` client (not service role) — RLS on the schema already permits anon reads.

- `lib/outreach-drafts-client.ts` — two small hooks:
  - `useOutreachDraftCounts(): Record<projectId, number>` — fetched once on mount, refetched when an outreach `agent_log` event lands (subscribes to the existing realtime hook).
  - `useOutreachDraftsForProject(projectId: string)` → `{ drafts, loading }` — used by the modal.

  ~50 lines.

**Touched (additive, three-way-merge friendly):**

- `components/live/AgentStatusRow.tsx` — add `'outreach'` to `cellOrder` between `'verifier'` and `'adjacent'`. Net: 1 line of array mutation. The 5-cell layout fits — flex distributes width evenly; existing 25%-each cells become 20%-each. I'll eyeball at 1280px and 1440px; if the squeeze is bad, fallback is to drop `'adjacent'` to a second line — but I'll ask first if it comes to that.

- `components/live/AgentCell.tsx` — add an `'outreach'` branch to `metricsFor()` (3 metrics: `last cycle`, `drafts today`, `clean rate`) and a corresponding branch to `deriveCellData()`. Reuses `recordsToday` aggregate (already populated for outreach in `useAgentAggregates`) for the `drafts today` count. ~25 lines.

- `components/ProjectList.tsx` — `ProjectRow` gains one optional badge, rendered only when the project has ≥1 draft. Sits in the bottom row next to the warm chip. Visual: small mono pill `📧 3` (or just `3 drafts` if emoji feels off-brand — picking the latter to stay consistent with the existing dashboard typographic style). ~15 lines including the hook call. Counts come from `useOutreachDraftCounts`.

- `components/ProjectModal.tsx` — new `<Section title="Outreach drafts" sub="from outreach agent">` rendered between the existing `Recommended outreach` section and the `Source record` section. Three sub-cards (one per channel) with subject (email only), body, word/char count, draft timestamp, and warning tags if any. Read-only — no copy/edit/send buttons in this PR. ~80 lines.

**Total estimate: ~240 lines.** PR description will note the gap from Kyle's "50 lines" — I'd rather explain than under-deliver.

**Out of scope (will not touch):**

- `app/api/projects/route.ts` — not modified
- `app/api/agents/route.ts` — already returns `outreach` in the agents map; no change needed
- `lib/types.ts` — `OutreachDraft` already exists from the P0-02 PR
- `lib/realtime.ts` — touched ONLY through importing the new client hook; no edits to existing exports
- `components/dashboard.tsx` — no edits; the badge and section are self-contained inside their respective components
- `lib/outreach.ts` — agent code, untouched
- `prompts/outreach-drafter.md` — untouched
- `app/api/cron/outreach/route.ts` — untouched
- The Intelligence Chat panel surfaces — untouched

---

## 4. Changes in detail

### 4.1 `app/api/outreach-drafts/route.ts`

```ts
// GET /api/outreach-drafts
//   → { counts: { [projectId]: number } } over all rows
//
// GET /api/outreach-drafts?project_id=<id>
//   → { drafts: OutreachDraft[] }
//
// Read-only. Anon client (RLS on pathfinder schema permits select for anon).
```

Single Next.js route handler, ~60 lines including auth boilerplate and error JSON. Hard cap of 50 drafts returned per project (the cron only writes 3 per project, so this is a safety ceiling).

### 4.2 `lib/outreach-drafts-client.ts`

```ts
export function useOutreachDraftCounts(): {
  counts: Record<string, number>;
  loading: boolean;
};

export function useOutreachDraftsForProject(
  projectId: string | null,
): { drafts: OutreachDraft[]; loading: boolean };
```

`useOutreachDraftCounts` fetches once on mount, then refetches whenever `useAgentLog()` (already in `lib/realtime.ts`) emits a new `outreach`-tagged event. Cheap; the count map is small (~500 entries max).

`useOutreachDraftsForProject` fetches once when the modal opens; no realtime subscription needed since drafts are immutable once written.

### 4.3 `components/live/AgentStatusRow.tsx`

```diff
-  const cellOrder: AgentName[] = ['ingestor', 'ranker', 'verifier', 'adjacent'];
+  const cellOrder: AgentName[] = ['ingestor', 'ranker', 'verifier', 'outreach', 'adjacent'];
```

That's the only change to this file. The cell renderer is in `AgentCell.tsx`.

### 4.4 `components/live/AgentCell.tsx`

Add an `'outreach'` clause to `metricsFor()`:

```ts
if (id === 'outreach') {
  return [
    { label: 'last cycle', value: fmtAgo(d.lastCycleSec) },
    { label: 'drafts today', value: d.recordsToday ?? 0 },
    { label: 'avg lat', value: ((d.latMs ?? 0) / 1000).toFixed(1) + 's' },
  ];
}
```

And a parallel clause to `deriveCellData()`:

```ts
if (id === 'outreach') {
  return {
    status,
    lastCycleSec,
    recordsToday: extras?.recordsToday ?? run.records_processed ?? 0,
    latMs,
  };
}
```

The existing `AgentCellData` type already supports `recordsToday`. No type changes needed.

### 4.5 `components/ProjectList.tsx` — ProjectRow badge

In `ProjectRow`, after the existing warm-chip rendering:

```tsx
{draftCount > 0 && (
  <span
    className="pf-mono"
    style={{
      font: `600 9.5px ${PF.mono}`,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: PF.ink,
      padding: '2px 6px',
      borderRadius: 2,
      background: PF.hiSoft,
      whiteSpace: 'nowrap',
    }}
    title={`${draftCount} outreach draft${draftCount === 1 ? '' : 's'} ready`}
  >
    {draftCount} drafts
  </span>
)}
```

The `draftCount` comes from a `useOutreachDraftCounts()` call at the top of `ProjectRow` — single hook call, lookup by project id. The hook deduplicates network calls because React batches identical fetches across render cycles.

If the warm chip and drafts chip both want `marginLeft: 'auto'`, only one wins — I'll group them in a flex container.

### 4.6 `components/ProjectModal.tsx` — `Outreach drafts` section

New `<Section>` between `Recommended outreach` and `Source record`:

```tsx
<Section title="Outreach drafts" sub={draftsSub(drafts, loading)}>
  {loading ? (
    <p className="pf-body" style={{ color: PF.inkDim }}>Loading drafts…</p>
  ) : drafts.length === 0 ? (
    <p className="pf-body" style={{ color: PF.inkDim }}>
      No drafts yet. The Outreach agent runs every 15 and 45 past the hour
      and drafts within 30 minutes of verification.
    </p>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} />
      ))}
    </div>
  )}
</Section>
```

`DraftCard` is a local component in this file (~40 lines): channel label, subject (email only), body in a tight box, mono footer with word count + draft timestamp + warning tags if any. No buttons — view-only for V1.

---

## 5. Visual treatment

The dashboard's design baseline is the cyan/hi accent (`#22d3ee`) for primary positive surfaces (verified, score ≥ 80). Outreach-related UI uses the same `hi` family because the Outreach agent's tint is `hi` per `lib/agent-tints.ts`.

- AgentStatusRow cell: per the existing pattern, agent name gets cyan ink, status pill follows the universal status colors. Same as Ranker's cell.
- ProjectList badge: cyan-soft fill, ink text, mono. Matches the warm chip's footprint so they line up cleanly.
- ProjectModal section: standard `<Section>` chrome, no special accent. Each `DraftCard` has a 1px ruleSoft border, no fill.

No new design tokens. No new colors. No emoji.

---

## 6. Testing

**Unit:**

- `app/api/outreach-drafts/route.ts` — small vitest covering: returns `counts` shape with no query, returns `drafts` shape with `?project_id=<x>`, returns 400 on invalid query params.

**Manual / visual:**

- Run `npm run dev` in the worktree. Open the dashboard at a project that has drafts (the production cron has been running — by the time we test, there should be 30+ projects with drafts).
- Verify: AgentStatusRow now has 5 cells, outreach cell shows `drafts today · X`. Status pill flips to running during a cycle.
- Click a project that has drafts in the list — verify the badge renders, count matches the modal's section.
- Open the modal — verify the three draft cards render, copy is the spec-correct length (60-90 word email visible, etc.).
- Open a project with NO drafts (e.g., score < 80 verified leads) — verify no badge, modal section shows the empty state.
- Test responsive: 1280px and 1440px window. Screenshot both.

**Acceptance bar (per Kyle's request):**

- [ ] AgentStatusRow renders 5 cells, no overflow at 1280px
- [ ] Badge renders only for projects with ≥1 draft
- [ ] Modal section renders 3 cards (email + linkedin + voicemail) for a project with drafts
- [ ] Modal section renders empty state copy for a project without drafts
- [ ] No console errors
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| 5-cell row overflows at 1280px | If the squeeze is unreadable, fallback is to drop `adjacent` to a Liveness-Subagent-shaped second row — but that's out of scope for this PR. I'll ask before expanding. Most likely the squeeze is fine; the existing cells have `min-width: 0` already and the metrics are short. |
| `useOutreachDraftCounts` causes 500-row re-renders on every realtime tick | Hook returns a stable reference unless the count map actually changed. Components only re-render if their specific count value changed (use selector pattern via `useMemo`). |
| `agent_name='outreach'` event triggers a count refetch every cycle for ALL clients open at once | Acceptable — the response is small (~5KB for 500 projects) and the cron runs twice an hour, so traffic per session is negligible. |
| Drafts have `verifier_warnings` that look scary in the UI | Render warnings as small mono tags, not as red error blocks. The drafts are still usable; warnings are advisory per the P0-02 spec. |

---

## 8. Build sequence

Single wave; no parallelism needed at this size.

1. `app/api/outreach-drafts/route.ts` + its vitest. Verify the endpoint returns the right shape with `curl`.
2. `lib/outreach-drafts-client.ts`. Smoke-test with a one-line component log.
3. `components/live/AgentCell.tsx` + `AgentStatusRow.tsx` (paired change).
4. `components/ProjectList.tsx` badge.
5. `components/ProjectModal.tsx` section.
6. `npm run typecheck`, `npm run lint`, `npm test`. Manual verification at 1280px and 1440px.
7. Commit, push, PR. Hand off.

---

## 9. Open questions for Kyle

1. **The endpoint + hook are out of strict scope** ("nothing else"). Should I:
   - (a) include them in this PR (my plan as written), or
   - (b) split: ship the data path in a separate prior PR (`feat/outreach-drafts-api`) and rebase this branch on top, or
   - (c) read directly from supabase in the components (no new route, no new hook — but breaks the existing pattern)?

   My recommendation: (a). The endpoint is simple, the hook wraps it cleanly, and splitting adds review-cycle latency for no real isolation benefit. But I want explicit assent before I touch a new file.

2. **5-cell AgentStatusRow at 1280px.** If the squeeze is ugly I'd rather move `adjacent` to a second row OR shrink the routing-strip toggle, but both are bigger changes. Acceptable to leave at 5-cell-flex for now and revisit if it's bad? Or do you want me to test the 1280px breakpoint first and decide upfront?

3. **Warnings rendering.** Each draft can carry tags like `email_missing_20min_cta` or `dash_substituted` in `verifier_warnings`. My plan renders them as small mono tags in `DraftCard`. Alternative: hide warnings entirely in V1 (cleaner UI), or render them only when the count is ≥1 with an expandable disclosure. Preference?

4. **Badge text.** I picked `3 drafts` over `📧 3`. The existing dashboard uses no emoji anywhere (verified by grepping — zero hits). If you want the email icon, I'll switch but want to be deliberate about the precedent.

---

**End of plan. Ready for approval before any code is written.**
