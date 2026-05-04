import { useState } from 'react';
import { DefinePain } from './DefinePain';
import { ArchitectThinking } from './ArchitectThinking';
import type { ApproveMeta } from './ArchitectThinking';
import { BuildingCluster } from './BuildingCluster';
import { SystemDeployed } from './SystemDeployed';
import { useSystem } from '../../context/SystemContext';
import { createCustomerOrg } from '../../lib/customersClient';
import type { CustomerOrg } from '../../lib/contracts/customers';

type State = 'define' | 'thinking' | 'building' | 'deployed';

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
  const [createdOrg, setCreatedOrg] = useState<CustomerOrg | null>(null);
  const { deploy, resetToUnconfigured } = useSystem();

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      {state === 'define' && (
        <DefinePain
          onSubmit={(p) => {
            setPrompt(p);
            // Going into thinking — keep config unconfigured so visualizer renders empty.
            resetToUnconfigured();
            window.setTimeout(() => setState('thinking'), 1200);
          }}
        />
      )}
      {state === 'thinking' && (
        <ArchitectThinking
          buyerPain={prompt}
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
