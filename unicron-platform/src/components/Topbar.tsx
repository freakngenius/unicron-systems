export type TabId =
  | 'onboarding'
  | 'live'
  | 'inbox'
  | 'agents'
  | 'customers'
  | 'audit'
  | 'connectors-health'
  | 'eval-dashboard'
  | 'inngest-health'
  | 'cost-dashboard';

type Props = {
  active: TabId;
  onTab: (id: TabId) => void;
  onOpenSettings: () => void;
};

const tabs: { id: TabId; label: string }[] = [
  { id: 'onboarding', label: 'ONBOARDING' },
  { id: 'live', label: 'LIVE SYSTEM' },
  { id: 'inbox', label: 'ARCHITECT INBOX' },
  { id: 'agents', label: 'AGENTS' },
  { id: 'customers', label: 'CUSTOMERS' },
  { id: 'audit', label: 'AUDIT LOG' },
  { id: 'connectors-health', label: 'CONNECTORS' },
  { id: 'eval-dashboard', label: 'EVALS' },
  { id: 'inngest-health', label: 'INNGEST' },
  { id: 'cost-dashboard', label: 'COST' },
];

export function Topbar({ active, onTab, onOpenSettings }: Props) {
  return (
    <header
      className="fixed top-0 inset-x-0 z-30 h-14"
      style={{ background: 'var(--v3-topbar)', borderBottom: '1px solid var(--v3-rail-2)' }}
    >
      <div className="h-full px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onTab('onboarding')}
          className="flex items-center gap-2 group"
          aria-label="unicron"
        >
          <DiamondGlyph />
          <span className="mono text-[14px] tracking-wide" style={{ color: '#FFFFFF' }}>unicron</span>
        </button>

        <nav className="flex items-center gap-8">
          {tabs.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className="mono text-[12px] uppercase tracking-[0.18em] py-4 border-b-2 transition-colors"
                style={{
                  color: isActive ? '#FFFFFF' : 'var(--v3-topbar-text)',
                  borderBottomColor: isActive ? 'var(--v3-blue)' : 'transparent',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="transition-colors p-1 rounded-md"
          style={{ color: 'var(--v3-topbar-text)' }}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

function DiamondGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1 L15 8 L8 15 L1 8 Z"
        stroke="var(--accent)"
        strokeWidth="1.4"
        fill="var(--accent-soft)"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
