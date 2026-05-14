# SPEC — Architect Canvas Flowchart

Replace the static dotted circle in the Architect decomposition view with an infinite-canvas node-based flowchart that visualizes the architecture the Architect designs.

## Current state (confirmed via screenshot 2026-05-14)

Left pane: a static dotted circle with a dot in the middle, labeled "ARCHITECT · THINKING ...". It conveys nothing. Right pane: "WHAT THE CUSTOMER GETS" + "ARCHITECT · DECOMPOSING" text. The circle must be removed.

## What ships

1. **Remove the static dotted circle entirely.** Left pane becomes an infinite canvas.

2. **Top-down node-based flowchart.** As the Architect decomposes, draw a tree:
   - **Top:** data source nodes, each labeled with the source name
   - **Layer down:** watcher nodes (L2)
   - **Subsequent layers:** L3, L4 ... agent nodes — as many layers as the decomposition produces
   - **Bottom:** the customer dashboard, drawn as a circle node (terminal)
   - Edges connect each layer downward, showing data flow

3. **Auto-layout from architecture JSON.** `architecture.sources` → top nodes. `architecture.agents` / layered watcher structure → middle layers. `architecture.ui_plan` → terminal dashboard circle. Edges follow the decomposition's interconnections (ingestion → ranker → verifier → enricher → outreach drafter → briefer, or whatever the architecture specifies).

4. **Default view fits the frame.** `fitView` on render — whole tree visible without manual zoom.

5. **Zoom controls** bottom-left of canvas: `+` / `−` buttons.

6. **Pan** — click-drag the canvas background.

7. **Node detail popup** — clicking any node opens a popup with that element's design detail:
   - Data source → id, type (registered/tier-2/voice-agent/pending), what it ingests, cadence
   - Watcher/agent → name, role, instructions per architecture JSON (persona, thresholds, scoring weights, geo filters)
   - Dashboard circle → ui_plan summary (KPIs, charts, layout emphasis)

## Implementation

- Use @xyflow/react (React Flow) — handles infinite canvas, pan, zoom, fitView, custom nodes/edges. Add to unicron-platform deps if not present.
- Custom nodes: DataSourceNode (labeled rectangle), AgentNode (layer-colored rectangle), DashboardNode (circle, terminal).
- v3 light tokens: white node surfaces, --v3-line borders, --v3-blue edges, --v3-ink text, layer accents from v3 palette.
- Reads the same `architecture` JSON that drives the right-side text panel. No new backend.
- Right-side text panel stays as-is. Only the left pane changes.

## Acceptance criteria

- Static dotted circle removed.
- Left pane is an infinite canvas with a top-down flowchart: data sources (top, labeled) → watcher → agent layers → dashboard circle (bottom).
- Edges show downward flow.
- Default render fits the whole tree in frame.
- +/− zoom buttons bottom-left, functional.
- Click-drag pans.
- Clicking any node opens a design-detail popup.
- v3 light styling throughout.
- Works in standalone Metacron and Atrium-embedded Metacron.
- Verified by headless click-through.

## Out of scope

- Editing architecture by manipulating nodes (read-only for now).
- Real-time build-out animation (static post-decomposition view).
- Layout orientations other than top-down.

End.
