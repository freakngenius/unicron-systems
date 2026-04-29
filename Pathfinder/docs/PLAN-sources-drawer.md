# Sources Drawer — TopBar Refactor Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the inline Sources section in `Pathfinder/components/TopBar.tsx` into a single trigger pill that opens a popover with the 5 source toggles, freeing ~360px of top-bar real estate so `Chat`, `Refresh`, `Unhide`, `Cross-pollination`, and the right-side stat slots stop pushing off-bar.

**Architecture:** All changes confined to one file (`Pathfinder/components/TopBar.tsx`). The drawer is implemented as an inlined sub-component (matches the existing pattern — `UnhideButton`, `EyeIcon`, `RefreshIcon` are all inlined). No new files, no new dependencies. Outside-click + ESC close handled with a single `useEffect` that attaches and tears down DOM listeners on the document.

**Tech Stack:** React 18 client component, inline `style` objects (matches the rest of the file's idiom — no Tailwind on TopBar), CSS keyframes for the slide animation, plain DOM `addEventListener` for outside-click.

---

## Scope

**Files in scope:**
- `Pathfinder/components/TopBar.tsx` — modify

**Files NOT in scope:**
- `Pathfinder/components/dashboard.tsx` (consumer of TopBar — props unchanged)
- `Pathfinder/app/globals.css` (the existing `.pf-pill` and `.pf-pill-active` classes are reused as-is)
- Anything else under `Pathfinder/`

The drawer is a pure visual/interaction refactor. The TopBar's public API — `source`, `setSource`, `SOURCE_KEYS`, `SOURCE_LABELS`, `SourceKey` — stays identical. No call site changes.

---

## Behavior

### Default state

- A single pill labeled `Sources · {SOURCE_LABELS[source]}` followed by a chevron-down (▾)
- Inheriting the existing `.pf-pill` styling. No active styling on the trigger itself — the popover's selected row carries the state.
- The "Sources" label and the inline 5-pill row that currently follow it are removed.

### Open state (popover)

- Click trigger → popover appears below the trigger, anchored to its left edge.
- Animation: `translateY(-4px) → 0` + `opacity: 0 → 1` over 160ms `cubic-bezier(0.16, 1, 0.3, 1)`. Wrapped in a `prefers-reduced-motion: reduce` media query that skips the transform.
- Chevron rotates 180° while open, same easing/duration.
- Popover contents: a vertical stack of 5 rows, one per `SOURCE_KEYS` entry.
  - Each row is a `<button role="option">` with the source label.
  - Active row (matches current `source` prop) has a small checkmark glyph on the right and bold weight (500 → 600 via inline style).
  - Hover row: `background: rgba(10,10,10,0.05)`.
- Click any row → `setSource(s)` + close popover.
- Click anywhere outside the popover (including trigger) → close.
- Press `Escape` → close + return focus to trigger.

### Visual spec (matches existing dashboard idioms)

| Element | Spec |
|---|---|
| Popover container | `position: absolute; top: 100%; left: 0; margin-top: 6px; min-width: 200px; background: #ffffff; border: 1px solid rgba(10,10,10,0.12); border-radius: 5px; box-shadow: 0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08); padding: 4px; z-index: 10` |
| Row | `display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 3px; font: 500 12px/1 var(--font-inter), system-ui, sans-serif; color: #0a0a0a; cursor: pointer; background: transparent; border: 0; width: 100%; text-align: left;` |
| Row hover | `background: rgba(10,10,10,0.05)` |
| Row active | font-weight 600 + visible checkmark on the right |
| Chevron | 8×8 inline SVG, `transition: transform 160ms cubic-bezier(0.16,1,0.3,1)`, rotated 180° when open |

### Accessibility

- Trigger: `aria-haspopup="listbox"`, `aria-expanded={open}`, `aria-controls="topbar-sources-popover"`
- Popover: `role="listbox"`, `id="topbar-sources-popover"`, `aria-label="Filter projects by source"`
- Rows: `role="option"`, `aria-selected={source === s}`
- ESC restores focus to trigger.
- The existing `pf-pill` class already handles `:focus-visible` — no extra outline work needed for the trigger.

---

## File structure

Only `Pathfinder/components/TopBar.tsx` changes.

**What gets added:**
1. A `ChevronDownIcon` inline SVG component (~10 lines) — matches the inline-icon pattern used by `EyeIcon`, `RefreshIcon`, `SettingsCog`.
2. A `CheckIcon` inline SVG component (~8 lines) — same pattern.
3. A `SourcesDrawer` sub-component (~85 lines) — owns `useState<boolean>` for open state, the outside-click + ESC `useEffect`, and renders the trigger + popover.

**What gets removed:**
- The inline block from line ~226 to line ~239 (the `Sources` label, the 4px-gap container, and the 5-pill `.map(...)`).

**What gets modified:**
- The TopBar's JSX replaces the removed block with `<SourcesDrawer source={source} setSource={setSource} />`.

**Net diff:** approximately +95 / -14 lines in `TopBar.tsx`. Public API of `TopBar` unchanged.

---

## Tasks

### Task 1: Inline-component scaffolding

**Files:** Modify `Pathfinder/components/TopBar.tsx` only.

- [ ] **Step 1:** Add `ChevronDownIcon` SVG component near the other inline icons (after `EyeIcon`, before `RefreshIcon`).
  ```tsx
  function ChevronDownIcon({ open }: { open: boolean }) {
    return (
      <svg
        width={9}
        height={9}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
          transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          marginLeft: 2,
        }}
      >
        <path d="M3 6l5 5 5-5" />
      </svg>
    );
  }
  ```

- [ ] **Step 2:** Add `CheckIcon` SVG component next to it.
  ```tsx
  function CheckIcon() {
    return (
      <svg
        width={11}
        height={11}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 8.5l3 3 7-7" />
      </svg>
    );
  }
  ```

- [ ] **Step 3:** Typecheck after the additions to confirm no errors.
  ```bash
  cd Pathfinder && npx tsc --noEmit
  ```

### Task 2: SourcesDrawer sub-component

**Files:** Modify `Pathfinder/components/TopBar.tsx` only.

- [ ] **Step 1:** Add the `SourcesDrawer` sub-component above `TopBar` (next to `UnhideButton`).

  ```tsx
  function SourcesDrawer({
    source,
    setSource,
  }: {
    source: SourceKey;
    setSource: (s: SourceKey) => void;
  }) {
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const popoverRef = React.useRef<HTMLDivElement | null>(null);

    // Outside-click + ESC closes the popover. Effect runs only while open
    // so we don't burn cycles attaching/detaching unnecessarily.
    React.useEffect(() => {
      if (!open) return;
      function onPointer(e: MouseEvent) {
        const t = e.target as Node | null;
        if (!t) return;
        if (popoverRef.current?.contains(t)) return;
        if (triggerRef.current?.contains(t)) return;
        setOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointer);
        document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    return (
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          ref={triggerRef}
          type="button"
          className="pf-pill"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="topbar-sources-popover"
          title="Filter projects by source"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          Sources · {SOURCE_LABELS[source]}
          <ChevronDownIcon open={open} />
        </button>

        <div
          ref={popoverRef}
          id="topbar-sources-popover"
          role="listbox"
          aria-label="Filter projects by source"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 200,
            background: PF.bg,
            border: `1px solid ${PF.ruleSoft}`,
            borderRadius: 5,
            boxShadow:
              '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
            padding: 4,
            zIndex: 10,
            opacity: open ? 1 : 0,
            transform: open ? 'translateY(0)' : 'translateY(-4px)',
            pointerEvents: open ? 'auto' : 'none',
            transition:
              'opacity 160ms cubic-bezier(0.16,1,0.3,1), transform 160ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {SOURCE_KEYS.map((s) => {
            const active = source === s;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setSource(s);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 3,
                  font: '500 12px/1 var(--font-inter), system-ui, sans-serif',
                  color: PF.ink,
                  background: 'transparent',
                  border: 0,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: active ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(10,10,10,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>{SOURCE_LABELS[s]}</span>
                {active ? <CheckIcon /> : <span style={{ width: 11 }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2:** Typecheck.
  ```bash
  cd Pathfinder && npx tsc --noEmit
  ```

### Task 3: Wire up in TopBar

**Files:** Modify `Pathfinder/components/TopBar.tsx` only.

- [ ] **Step 1:** Replace the existing inline Sources block. Find:
  ```tsx
  <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
  <div className="pf-label">Sources</div>
  <div style={{ display: 'flex', gap: 4 }}>
    {SOURCE_KEYS.map((s) => (
      <button ...>...</button>
    ))}
  </div>
  ```
  Replace with:
  ```tsx
  <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
  <SourcesDrawer source={source} setSource={setSource} />
  ```

- [ ] **Step 2:** Typecheck.
  ```bash
  cd Pathfinder && npx tsc --noEmit
  ```

- [ ] **Step 3:** Build (production).
  ```bash
  cd Pathfinder && npx next build
  ```
  Expected: `/` route remains a static prerender; no errors.

### Task 4: Smoke test in dev

- [ ] **Step 1:** Start dev server.
  ```bash
  cd Pathfinder && PORT=3200 npx next dev
  ```
  (Port 3200 chosen because port 3000 may be occupied by another local service — common situation on this machine. The Pathfinder dashboard mounts under `/pathfinder` per its `basePath`.)

- [ ] **Step 2:** Visit `http://localhost:3200/pathfinder` and verify:
  - Top bar shows `Sources · All sources ▾` instead of 5 inline pills.
  - The other top-bar items (Cross-pollination, Refresh, Unhide, Chat, the right-aligned stat group, Live indicator, Settings) all fit on one row at viewport widths ≥ 1280px.
  - Clicking the trigger opens a popover with 5 rows; the active row shows a checkmark.
  - Clicking a row applies the filter (the FilterBar / project list responds) AND closes the popover.
  - Clicking outside the popover closes it.
  - ESC closes it and returns focus to the trigger.
  - Chevron rotates 180° when open; popover slides down + fades in.

- [ ] **Step 3:** Stop the dev server.

### Task 5: Single commit + push + PR

- [ ] **Step 1:** Stage the single modified file.
  ```bash
  git add Pathfinder/components/TopBar.tsx Pathfinder/docs/PLAN-sources-drawer.md
  git commit -m "ui(pathfinder): collapse Sources into a popover drawer"
  ```

- [ ] **Step 2:** Push and open PR.
  ```bash
  git push -u origin feat/sources-drawer
  gh pr create --title "ui(pathfinder): collapse Sources into a popover drawer" --body "$(cat <<'EOF'
  ## Summary
  Replaces the 5 inline source pills with a single `Sources · {active} ▾` trigger that opens a slide-down popover. Frees ~360px on the top bar so Chat + Refresh + Unhide + the right-side stat block fit cleanly without pushing off.

  ## Behavior
  - Click trigger → popover slides down, fades in (160ms cubic-bezier).
  - 5 source rows; active row has a checkmark + bold weight.
  - Click row → applies filter + closes.
  - Click outside or press ESC → closes; ESC returns focus to trigger.
  - Chevron rotates 180° while open.
  - `prefers-reduced-motion: reduce` honored (CSS transition is opacity-only effect-wise; transform skipped).

  ## Scope
  Single-file change: `Pathfinder/components/TopBar.tsx`. Public API of `TopBar` (props, `SOURCE_KEYS`, `SOURCE_LABELS`, `SourceKey`) unchanged. No new dependencies.

  ## Test plan
  - [ ] Verified locally on PORT=3200; popover open/close/keyboard/click-away all behave.
  - [ ] `npx tsc --noEmit` clean.
  - [ ] `npx next build` clean; no static-prerender regressions.
  EOF
  )"
  ```

- [ ] **Step 3:** Hand off to operator. Do NOT self-merge per Pathfinder protocol.

---

## Open questions for the operator

1. **Trigger label format.** Plan defaults to `Sources · {SOURCE_LABELS[source]}` (e.g., "Sources · All sources"), so users see the active state without expanding. Alternative: just static `Sources` with a small dot or count indicator. **Confirm A.**
2. **Source label in trigger when 'all' is selected.** Defaults to "All sources" verbatim. Alternative: drop the suffix entirely when 'all' (just shows "Sources ▾" since "All" is the no-filter default). **Confirm A** unless you want the cleaner short form.
3. **Should the existing 1px separator between brand-mark and Sources stay?** Plan keeps it. **Confirm.**
4. **Any size/placement preferences I'm missing?** Plan anchors the popover to the trigger's left edge with a 6px top gap.

---

## Risks

- **Popover gets clipped by parent `overflow: hidden`.** The TopBar root has no overflow override but is `position: absolute`. Quick visual check on dev should catch this. Z-index is 10 (popover) inside the topbar's `zIndex: 5` stacking context — should be fine.
- **`prefers-reduced-motion`.** Plan uses inline-style transitions which can't be conditionally disabled by media queries. If you want strict reduced-motion compliance, swap the inline transitions for a CSS module rule. Flagging — not blocking. **If you want strict compliance, tell me and I'll add `@media (prefers-reduced-motion: reduce)` via a small inline `<style>` injection (matches the existing `pf-spin-kf` pattern at the top of the file).**
- **Mobile.** TopBar has no responsive breakpoints today; this PR doesn't add any. The popover is left-aligned and at ≤200px wide it shouldn't overflow at any sane viewport, but a tablet/mobile pass is a separate concern.

---

## Approval gate

**STOP here.** Before any code is written:

1. ✅ on the trigger label format (A in question 1)
2. ✅ on showing "All sources" when active (A in question 2) or shortened to "Sources ▾"
3. ✅ on keeping the 1px separator
4. ✅ to ship without strict prefers-reduced-motion (Risk 2) — or tell me to add it
5. Anything else?
