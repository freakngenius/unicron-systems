## ADDED Requirements

### Requirement: SystemConfig SHALL be persisted across page reloads

The application SHALL serialize the current `SystemConfig` to `localStorage` whenever the configuration changes, so the operator returns to the same deployed system after a browser reload.

#### Scenario: Operator deploys then reloads
- **WHEN** the operator approves an Architect-drafted system on the Onboarding tab and then reloads the page
- **THEN** on next mount the application SHALL hydrate the same `SystemConfig` (same status, same `dataSources`, same `agents`) from `localStorage` and route the operator to a deployed view rather than back to Onboarding's `define` step.

#### Scenario: First-time visitor with no stored config
- **WHEN** a fresh browser with no `localStorage` entry for the application loads the app
- **THEN** the application SHALL initialize `SystemConfig` to its default `unconfigured` state and route the operator to Onboarding's `define` step.

### Requirement: Persistence writes SHALL be debounced

The application MUST avoid writing to `localStorage` on every individual mutation when several happen in rapid succession (e.g. approving multiple inbox proposals). Writes SHALL be debounced so that bursts of mutations produce one write at the end of the burst.

#### Scenario: Burst of mutations
- **WHEN** the operator approves three Architect Inbox proposals within 200ms
- **THEN** the application SHALL perform at most one write to `localStorage` after the burst settles, containing the final state.

### Requirement: Persisted blobs SHALL include a schema version

Every blob written to `localStorage` MUST include a numeric `version` field. On hydrate, the application SHALL refuse to load blobs whose `version` is unknown, falling back to the unconfigured default state instead of crashing or partially loading.

#### Scenario: Stored blob has unknown schema version
- **WHEN** the application boots and finds a `localStorage` blob with `version` higher than the running code understands
- **THEN** the application SHALL discard the blob silently, log a warning to the console, and initialize `SystemConfig` to the unconfigured default.

### Requirement: Operator SHALL be able to reset the persisted system

The Settings drawer SHALL expose a "Reset system" action that clears both the in-memory `SystemConfig` and the `localStorage` blob, returning the operator to the unconfigured starting state.

#### Scenario: Operator triggers a reset
- **WHEN** the operator clicks "Reset system" in the Settings drawer and confirms
- **THEN** the application SHALL set `SystemConfig` to the unconfigured default, remove the `localStorage` blob, close the Settings drawer, and route the operator to Onboarding's `define` step.

#### Scenario: No confirmation given
- **WHEN** the operator opens the "Reset system" confirmation prompt and dismisses it without confirming
- **THEN** the application SHALL leave both in-memory state and `localStorage` unchanged.
