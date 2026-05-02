// AddSourcePanel — redirect shim (Phase 1 / Stream M2).
//
// The full AddSourcePanel implementation was archived to ./_archive/AddSourcePanel.tsx
// when Source Onboarder migrated to its own agent modal under the Agents tab.
// This shim preserves the LiveSystem ActionBar's "Add Source" affordance —
// clicking it now surfaces a small redirect notice rather than opening the
// (now-stale) two-phase analyze→deploy flow.
//
// Operators reach the new flow via Topbar → AGENTS → Source Onboarder tile.
// LiveSystem doesn't have direct access to the tab-switch callback (App.tsx
// owns it), so this shim only renders a notice + close button. A follow-up
// can thread an `onSwitchToAgentsTab` callback through the panel system if
// the friction warrants the extra plumbing.

import { PanelShell } from './PanelShell';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddSourcePanel({ open, onClose }: Props) {
  return (
    <PanelShell
      open={open}
      title="ADD SOURCE — MOVED"
      subtitle="The Source Onboarder is now an agent modal under the Agents tab."
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-text-primary leading-relaxed">
          Click <span className="mono text-accent-gold">AGENTS</span> in the top bar, then open
          the <span className="mono">Source Onboarder</span> tile. Same flow, more transparency:
          live investigation log, Tier 1 vs Tier 2 decision with reasoning, and the operator-side
          Tier 2 resolve modal.
        </p>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          Original AddSourcePanel preserved at src/components/live/panels/_archive/AddSourcePanel.tsx
        </p>
      </div>
    </PanelShell>
  );
}
