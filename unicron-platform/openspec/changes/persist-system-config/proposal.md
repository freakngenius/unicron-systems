## Why

Today the operator's deployed system lives only in React state. Reloading the browser drops `SystemConfig` back to `unconfigured` and forces them to re-do Onboarding. For a tool whose value proposition is "I designed this; come back later and watch it work," that round-trip is a credibility leak.

## What Changes

- New `useSystemPersistence` hook that mirrors `SystemContext.config` to `localStorage` on every change, with a debounced write.
- On `<SystemProvider>` mount, hydrate from `localStorage` if a valid blob exists (status `live` or `configured`), else fall back to the existing empty `SystemConfig`.
- Schema versioning: persist with `version: 1`. On hydrate, drop blobs whose version is unknown rather than blowing up.
- Settings drawer adds a "Reset system" action that clears both `localStorage` and the in-memory config (returns the operator to Onboarding).
- **BREAKING** None. The change is additive; first-load with no stored blob keeps current behavior.

## Capabilities

### New Capabilities
- `system-persistence`: persist `SystemConfig` across page reloads, hydrate on mount, and provide a reset action.

### Modified Capabilities

(none — `SystemContext`'s public mutator API is unchanged.)

## Impact

- `src/context/SystemContext.tsx` — wraps state with hydration + write-through to `localStorage`.
- `src/components/SettingsDrawer.tsx` — adds "Reset system" row.
- New `src/context/persistence.ts` — schema version, serialize/deserialize, storage key.
- No new dependencies. `localStorage` is already available in all target browsers.
- No backend changes; this is operator-local state. Multi-device sync is a later phase.
