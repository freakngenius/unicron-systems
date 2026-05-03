import { useState } from 'react';
import { DefinePain } from './DefinePain';
import { ArchitectThinking } from './ArchitectThinking';
import { BuildingCluster } from './BuildingCluster';
import { SystemDeployed } from './SystemDeployed';
import { useSystem } from '../../context/SystemContext';

type State = 'define' | 'thinking' | 'building' | 'deployed';

type Props = {
  onOpenLive: () => void;
};

export function Onboarding({ onOpenLive }: Props) {
  const [state, setState] = useState<State>('define');
  const [prompt, setPrompt] = useState('');
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
          onApprove={(config) => {
            // Apply the architecture (either the unedited recommendation or
            // the operator's edited shape) so BuildingCluster can derive its
            // scripted timeline (data sources, agents) from real config.
            deploy(config);
            setState('building');
          }}
        />
      )}
      {state === 'building' && (
        <BuildingCluster onComplete={() => setState('deployed')} />
      )}
      {state === 'deployed' && <SystemDeployed onOpenLive={onOpenLive} />}
    </div>
  );
}
