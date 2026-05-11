// Collapse/expand controls for the Atrium filter sidebar.
// State is shared via useFilterSidebarCollapsed (localStorage-backed) so
// collapse persists across People / Work / Money / other filter surfaces.

interface ToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
}

export function FilterSidebarToggle({ collapsed, onToggle, label = 'Filters' }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-[11px] text-text-muted hover:text-text-primary font-medium flex items-center gap-1"
      aria-label={collapsed ? `Expand ${label.toLowerCase()}` : `Collapse ${label.toLowerCase()}`}
      aria-expanded={!collapsed}
      title={collapsed ? `Expand ${label.toLowerCase()}` : `Collapse ${label.toLowerCase()}`}
    >
      <svg width="11" height="11" viewBox="0 0 10 10" fill="none" style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 140ms' }}>
        <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function FilterSidebarExpandStrip({ onExpand }: { onExpand: () => void }) {
  return (
    <aside
      className="flex flex-col items-center pt-1"
      aria-label="Filters (collapsed)"
    >
      <button
        type="button"
        onClick={onExpand}
        className="w-7 h-7 rounded-md border border-border-default bg-white text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors flex items-center justify-center"
        aria-label="Expand filters"
        title="Expand filters"
      >
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </aside>
  );
}
