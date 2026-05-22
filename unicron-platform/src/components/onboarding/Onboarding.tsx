import { useEffect, useState } from 'react';
import { DefinePain } from './DefinePain';
import { ArchitectThinking } from './ArchitectThinking';
import type { ApproveMeta } from './ArchitectThinking';
import { BuildingCluster } from './BuildingCluster';
import { SystemDeployed } from './SystemDeployed';
import { CustomerIntakeModal, type CustomerIntake } from './CustomerIntakeModal';
import { useSystem } from '../../context/SystemContext';
import { createCustomerOrg, listCustomerOrgs } from '../../lib/customersClient';
import type { CustomerOrg } from '../../lib/contracts/customers';

type State = 'define' | 'intake' | 'thinking' | 'building' | 'deployed';

type Props = {
  onOpenLive: () => void;
  /**
   * Called after Approve & Deploy persists the new customer org. The host
   * routes the operator to /customers/:slug. When undefined or persistence
   * is disabled and the call returns null, the legacy onOpenLive flow runs.
   */
  onCustomerCreated?: (org: CustomerOrg) => void;
};

export function Onboarding({ onOpenLive, onCustomerCreated }: Props) {
  const [state, setState] = useState<State>('define');
  const [prompt, setPrompt] = useState('');
  const [intake, setIntake] = useState<CustomerIntake | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [createdOrg, setCreatedOrg] = useState<CustomerOrg | null>(null);
  const { deploy, resetToUnconfigured } = useSystem();

  // Prefetch existing slugs when the operator enters intake so the modal
  // can validate uniqueness without waiting on a roundtrip. Refetched on
  // each entry into the intake step in case another tab/operator created
  // an org in the interim.
  useEffect(() => {
    if (state !== 'intake') return;
    let cancelled = false;
    listCustomerOrgs()
      .then((orgs) => {
        if (cancelled) return;
        setExistingSlugs(orgs.map((o) => o.slug));
      })
      .catch(() => {
        // Non-fatal — server-side check still runs at createCustomerOrg.
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  // The `thinking` state renders its own full-viewport edge-attached layout
  // (left text pane + right canvas), so it must NOT be wrapped in the centering
  // flex container that the other states use.
  if (state === 'thinking') {
    return (
      <ArchitectThinking
        buyerPain={prompt}
        customerIntake={intake ?? undefined}
        onApprove={async (config, meta: ApproveMeta) => {
          // Apply the architecture so BuildingCluster can derive its
          // scripted timeline (data sources, agents) from real config.
          deploy(config);
          // Persist the new customer org. Throws SlugConflictError on
          // collision; ArchitectThinking surfaces the message in the modal.
          const org = await createCustomerOrg({
            name: meta.name,
            slug: meta.slug,
            architecture: meta.architecture,
          });
          setCreatedOrg(org);
          setState('building');
        }}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      {state === 'define' && (
        <DefinePain
          onSubmit={(p) => {
            setPrompt(p);
            // Going into thinking — keep config unconfigured so visualizer renders empty.
            resetToUnconfigured();
            setState('intake');
          }}
        />
      )}
      {state === 'intake' && (
        <CustomerIntakeModal
          existingSlugs={existingSlugs}
          onCancel={() => {
            setIntake(null);
            setState('define');
          }}
          onSubmit={(next) => {
            setIntake(next);
            setState('thinking');
          }}
        />
      )}
      {state === 'building' && (
        <BuildingCluster onComplete={() => setState('deployed')} />
      )}
      {state === 'deployed' && (
        <SystemDeployed
          onOpenLive={() => {
            if (createdOrg && onCustomerCreated) {
              onCustomerCreated(createdOrg);
              return;
            }
            onOpenLive();
          }}
        />
      )}
    </div>
  );
}
