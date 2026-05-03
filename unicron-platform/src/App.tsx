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
import { SignInGate } from './components/auth/SignInGate';
import { useAuth } from './lib/auth';
import type { CustomerOrg } from './lib/contracts/customers';

function Shell() {
  const [tab, setTab] = useState<TabId>('onboarding');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customerSelected, setCustomerSelected] = useState<CustomerOrg | null>(null);
  const { toast } = useSettings();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <Topbar
        active={tab}
        onTab={(id) => setTab(id)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="pt-14">
        {tab === 'onboarding' && <Onboarding onOpenLive={() => setTab('live')} />}
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
      </main>

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

function AuthedShell() {
  const auth = useAuth();
  const operatorKey = auth.status === 'signed-in' ? auth.user.id : null;
  return (
    <SettingsProvider operatorKey={operatorKey}>
      <SystemProvider>
        <Shell />
      </SystemProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <SignInGate>
      <AuthedShell />
    </SignInGate>
  );
}
