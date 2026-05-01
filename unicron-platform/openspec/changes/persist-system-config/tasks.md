## 1. Persistence module

- [ ] 1.1 Create `src/context/persistence.ts` exporting `STORAGE_KEY`, `STORAGE_VERSION`, `loadStoredConfig()`, and `writeStoredConfig(config)`.
- [ ] 1.2 In `loadStoredConfig`, parse `localStorage.getItem(STORAGE_KEY)`; on JSON failure, schema-version mismatch, or any throw, return `null` and `console.warn`.
- [ ] 1.3 In `writeStoredConfig`, JSON.stringify a `{ version, config, savedAt }` blob and `localStorage.setItem(STORAGE_KEY, blob)` inside a try/catch that warns on quota exceeded.
- [ ] 1.4 Export `clearStoredConfig()` that calls `localStorage.removeItem(STORAGE_KEY)`.

## 2. Hydrate `SystemContext`

- [ ] 2.1 In `SystemProvider`, change the `useState<SystemConfig>` initializer from `emptyConfig` to a function that calls `loadStoredConfig() ?? emptyConfig`.
- [ ] 2.2 Add a `useEffect([config])` that schedules a 150ms `setTimeout` to call `writeStoredConfig(config)`; clear the timeout in cleanup.
- [ ] 2.3 Update `resetToUnconfigured` in `SystemContext` to also call `clearStoredConfig()` so reset flushes both layers.
- [ ] 2.4 Skip writing on initial mount when `config.status === 'unconfigured'` AND no blob exists, to avoid creating an empty blob on first load.

## 3. Settings drawer reset action

- [ ] 3.1 Add a "System" section to `SettingsDrawer.tsx` with a "Reset system" row.
- [ ] 3.2 Wire the row to a handler that calls `window.confirm('Reset your system? This clears your deployed config.')` and, on confirm, calls `system.resetToUnconfigured()` then closes the drawer.
- [ ] 3.3 Surface a brief toast on reset using the existing `showToast` from `SettingsContext`.

## 4. Verification

- [ ] 4.1 Manual: deploy a system in Onboarding, reload the page, confirm the visualizer comes back populated and the active tab is Live System.
- [ ] 4.2 Manual: approve a Proposal in Architect Inbox, reload, confirm the new agent's instance still appears on the visualizer.
- [ ] 4.3 Manual: click "Reset system" → confirm → land on Onboarding `define`; reload → still on Onboarding `define` (blob cleared).
- [ ] 4.4 Manual: edit `localStorage` in DevTools to set `version: 999`, reload, confirm the app boots into Onboarding without crashing and logs a warning.
- [ ] 4.5 `npm run build` — TypeScript clean, no Vite errors.
