import { useState } from 'react';
import { Topbar, type TabId } from './components/Topbar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { SettingsProvider, useSettings } from './components/SettingsContext';
import { SystemProvider } from './context/SystemContext';
import { Onboarding } from './components/onboarding/Onboarding';
import { LiveSystem } from './components/live/LiveSystem';
import { ArchitectInbox } from './components/inbox/ArchitectInbox';
import { AgentsView } from './components/agent-console/AgentsView';
import { CustomersView } from './views/CustomersView';
import { CustomerDetailView } from './views/CustomerDetailView';
import { AuditLogView } from './views/audit-log/AuditLogView';
import { ConnectorsHealthView } from './views/connectors-health/ConnectorsHealthView';
import { EvalDashboardView } from './views/eval-dashboard/EvalDashboardView';
import { InngestHealthView } from './views/inngest-health/InngestHealthView';
import { CostDashboardView } from './views/CostDashboardView';
import { SignInGate } from './components/auth/SignInGate';
import { useAuth } from './lib/auth';
import type { CustomerOrg } from './lib/contracts/customers';
import { AtriumApp } from './atrium/AtriumApp';

// Host-based routing: any hostname starting with "atrium." → Atrium shell;
// everything else (unicron-platform.vercel.app, unicron.systems, localhost) → Metacron.
// Using startsWith('atrium.') covers both production (atrium.unicron.systems) and
// Vercel preview deployments that carry the atrium subdomain.
const isAtrium =
  typeof window !== 'undefined' &&
  window.location.hostname.startsWith('atrium.');

// ── Metacron tab list (shared between standalone Topbar and embedded sub-nav) ─
//
// Pass 1 of the Metacron → Atrium rebrand: the same set of tabs renders inside
// the Atrium Products → Metacron sub-tab via <MetacronShell embedded />.

const METACRON_TABS: { id: TabId; label: string }[] = [
  { id: 'onboarding',        label: 'Onboarding' },
  { id: 'live',              label: 'Live System' },
  { id: 'inbox',             label: 'Architect Inbox' },
  { id: 'agents',            label: 'Agents' },
  { id: 'customers',         label: 'Customers' },
  { id: 'audit',             label: 'Audit Log' },
  { id: 'connectors-health', label: 'Connectors' },
  { id: 'eval-dashboard',    label: 'Evals' },
  { id: 'inngest-health',    label: 'Inngest' },
  { id: 'cost-dashboard',    label: 'Cost' },
];

// ── MetacronShell ───────────────────────────────────────────────────────────
// The Metacron operator UI. When `embedded` is true the outer Topbar + fixed
// top padding are skipped (the Atrium shell already provides the rail and
// header), and an inline sub-nav is rendered above the content area.

type MetacronShellProps = {
  embedded?: boolean;
};

function MetacronShell({ embedded = false }: MetacronShellProps) {
  const [tab, setTab] = useState<TabId>('onboarding');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customerSelected, setCustomerSelected] = useState<CustomerOrg | null>(null);
  const { toast } = useSettings();

  const content = (
    <>
      {tab === 'onboarding' && (
        <Onboarding
          onOpenLive={() => setTab('live')}
          onCustomerCreated={(org) => {
            setCustomerSelected(org);
            setTab('customers');
          }}
        />
      )}
      {tab === 'live' && (
        <LiveSystem
          onArchitectClick={() => setTab('inbox')}
          onGoToOnboarding={() => setTab('onboarding')}
        />
      )}
      {tab === 'inbox' && <ArchitectInbox />}
      {tab === 'agents' && <AgentsView />}
      {tab === 'customers' && (
        customerSelected ? (
          <CustomerDetailView
            org={customerSelected}
            onBack={() => setCustomerSelected(null)}
          />
        ) : (
          <CustomersView onSelect={(org) => setCustomerSelected(org)} />
        )
      )}
      {tab === 'audit' && <AuditLogView />}
      {tab === 'connectors-health' && <ConnectorsHealthView />}
      {tab === 'eval-dashboard' && <EvalDashboardView />}
      {tab === 'inngest-health' && <InngestHealthView />}
      {tab === 'cost-dashboard' && <CostDashboardView />}
    </>
  );

  if (embedded) {
    // Embedded under Atrium Products → Metacron. Atrium already provides the
    // rail + header; we render ONLY a sub-nav (Atrium-style tab underline) +
    // content. No fixed Topbar, no pt-14.
    return (
      <div className="w-full">
        <nav
          className="flex gap-0.5 border-b mb-6 overflow-x-auto"
          style={{ borderColor: 'var(--border-default)' }}
          aria-label="Metacron sub-tabs"
          role="tablist"
        >
          {METACRON_TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-lo)',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                }}
              >
                {t.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                )}
              </button>
            );
          })}
        </nav>
        <section role="tabpanel" aria-label={tab}>
          {content}
        </section>

        {toast && (
          <div
            key={toast.id}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 mono text-[11px] uppercase tracking-[0.18em] text-accent-gold bg-bg-panel border border-border-default rounded-md px-4 py-2 z-[60] animate-toastUp pointer-events-none"
          >
            {toast.text}
          </div>
        )}
      </div>
    );
  }

  // Standalone Metacron (non-Atrium host) — keep the existing Topbar shell.
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <Topbar
        active={tab}
        onTab={(id) => setTab(id)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="pt-14">{content}</main>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {toast && (
        <div
          key={toast.id}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 mono text-[11px] uppercase tracking-[0.18em] text-accent-gold bg-bg-panel border border-border-default rounded-md px-4 py-2 z-[60] animate-toastUp pointer-events-none"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Standalone Metacron entry (non-Atrium hostnames) ────────────────────────

function AuthedShell() {
  const auth = useAuth();
  const operatorKey = auth.status === 'signed-in' ? auth.user.id : null;
  return (
    <SettingsProvider operatorKey={operatorKey}>
      <SystemProvider>
        <MetacronShell />
      </SystemProvider>
    </SettingsProvider>
  );
}

// ── Embedded Metacron entry (used by Atrium Products → Metacron) ────────────
//
// Exported so MetacronProduct.tsx can mount the full Metacron app with its
// outer shell stripped. Wraps the same Settings + System providers as the
// standalone shell so internal state (toast, system context) keeps working.

export function MetacronEmbedded() {
  const auth = useAuth();
  const operatorKey = auth.status === 'signed-in' ? auth.user.id : null;
  return (
    <SettingsProvider operatorKey={operatorKey}>
      <SystemProvider>
        <MetacronShell embedded />
      </SystemProvider>
    </SettingsProvider>
  );
}

export default function App() {
  if (isAtrium) {
    return <AtriumApp />;
  }
  return (
    <SignInGate>
      <AuthedShell />
    </SignInGate>
  );
}
