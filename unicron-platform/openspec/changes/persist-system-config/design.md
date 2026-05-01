## Context

`SystemContext` currently stores `SystemConfig` in React's `useState`. Onboarding writes the initial config; Inbox approvals and Live System action panels mutate it; the visualizer subscribes via `useSystem()`. There is no persistence layer.

For the operator the experience is: deploy a system, watch it run, hit refresh, see the empty Onboarding screen — having to redo the setup. Pretty bad for a product whose value prop is autonomous watching.

## Goals / Non-Goals

**Goals:**
- Reload-safe deployed system state.
- Zero new dependencies.
- Forward-compatible storage format (versioning).
- Manual reset action for operators who want to start over.

**Non-Goals:**
- Multi-device sync. (Operator-local for now; sync is a backend concern handled in a later phase.)
- Encrypted at-rest storage. `SystemConfig` is non-sensitive operator state.
- Server-side persistence. Pure client `localStorage`.
- Migrating between schema versions. v1 is the first version; future versions will revisit migration strategy then.

## Decisions

### Storage backend: `localStorage`, single key

`localStorage` is synchronous, available in every supported browser, and `SystemConfig` is small enough (kilobytes, not megabytes) that we don't need IndexedDB.

Alternative considered: `IndexedDB` (via `idb-keyval`). Rejected — adds a dependency, async API forces hydration to be a `useEffect`, no real benefit at this size.

Key: `unicron-platform:system-config:v1`.

### Schema versioning

The blob shape is:

```ts
type StoredBlob = {
  version: 1;
  config: SystemConfig;
  savedAt: string; // ISO 8601
};
```

`version` lets future code reject blobs it doesn't understand. `savedAt` is debug-only.

Alternative considered: no version field; trust the runtime types. Rejected — a single rename of an `AgentDef` field would silently corrupt loads for anyone with stored state.

### Hydration strategy: lazy initial state

`SystemProvider` reads `localStorage` once via `useState`'s initializer function. If the parse succeeds and `version === 1`, it hydrates with that config; otherwise it returns the empty default.

```ts
const [config, setConfig] = useState<SystemConfig>(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyConfig;
    const blob = JSON.parse(raw) as StoredBlob;
    if (blob.version !== 1) {
      console.warn(`[unicron] discarding stored config v${blob.version}`);
      return emptyConfig;
    }
    return blob.config;
  } catch (err) {
    console.warn('[unicron] failed to hydrate config:', err);
    return emptyConfig;
  }
});
```

This avoids a `useEffect`-driven flicker between empty and hydrated state.

### Write strategy: debounced effect

A single `useEffect` watches `config` and writes to `localStorage` after a 150ms debounce. Coalesces bursts (e.g. approving multiple inbox proposals) into one write.

```ts
useEffect(() => {
  const handle = window.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      config,
      savedAt: new Date().toISOString(),
    }));
  }, 150);
  return () => window.clearTimeout(handle);
}, [config]);
```

### Reset action

Settings drawer adds:

```
[ Reset system → ]
```

Click → confirmation prompt (browser `confirm()` for now; a custom modal is design polish for a later pass) → on confirm, call `resetToUnconfigured()` (already exists on `SystemContext`) and `localStorage.removeItem(STORAGE_KEY)`.

## Risks / Trade-offs

- **localStorage corrupted by another origin / extension** → Mitigation: the parse catch already returns `emptyConfig`.
- **localStorage quota exceeded** → Mitigation: catch the throw on write, log it, surface a one-time toast. `SystemConfig` is tiny; this is unlikely.
- **Stale state at the moment of the reset** → Mitigation: `resetToUnconfigured()` flushes both layers in one render; the debounce timer is cleared by the cleanup.
- **Schema drift between code and stored blob without bumping version** → Mitigation: bump `version` whenever `SystemConfig` changes shape. ADR to follow if this happens.

## Migration Plan

- Ship as a normal feature; no flag.
- First load with no stored blob → operator sees current behavior (Onboarding from scratch).
- Subsequent loads → operator returns to deployed state.
- Rollback: revert the change. Stored blobs become inert (the older code never reads them).

## Open Questions

- Do we want a "Snapshot / restore" feature on top of this (named saved configs)? Out of scope for v1; flagged for later.
- Should the reset confirmation be a styled modal vs. browser `confirm()`? Default to `confirm()` to ship fast; revisit after operator feedback.
