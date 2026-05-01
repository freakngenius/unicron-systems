import { useState } from 'react';
import { DefinePain } from './DefinePain';
import { ArchitectThinking } from './ArchitectThinking';
import { SystemDeployed } from './SystemDeployed';
import { useSystem } from '../../context/SystemContext';

type State = 'define' | 'thinking' | 'deployed';

type Props = {
  onOpenLive: () => void;
};

export function Onboarding({ onOpenLive }: Props) {
  const [state, setState] = useState<State>('define');
  const [prompt, setPrompt] = useState('');
  const { deployDefault, resetToUnconfigured } = useSystem();

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
          onApprove={() => {
            deployDefault(prompt);
            setState('deployed');
          }}
          onEdit={() => setState('define')}
        />
      )}
      {state === 'deployed' && <SystemDeployed onOpenLive={onOpenLive} />}
    </div>
  );
}
