import { useEffect, useRef, useState } from 'react';
import { TestResults } from './TestResults';
import { enricherTests } from '../../../../data/mocks';
import { FieldLabel, RadioRow } from './sourceFields';

type Props = {
  showTests: boolean;
  setShowTests: (v: boolean) => void;
  instruction: string;
  setInstruction: (v: string) => void;
  baseInstruction: string;
  roleName: string;
};

type Safety = 'closed' | 'open';

export function EditNodeEdit({
  showTests,
  setShowTests,
  instruction,
  setInstruction,
  baseInstruction,
  roleName,
}: Props) {
  const [model, setModel] = useState('sonar-pro');
  const [hops, setHops] = useState('3');
  const [confidence, setConfidence] = useState(0.65);
  const [safety, setSafety] = useState<Safety>('open');
  const testsRef = useRef<HTMLDivElement>(null);

  const dirty = instruction !== baseInstruction;

  useEffect(() => {
    if (showTests && testsRef.current) {
      testsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showTests]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="mono text-[11px] tracking-[0.22em] text-accent-gold uppercase">
          INSTRUCTION{' '}
          <span className="text-text-secondary normal-case tracking-[0.08em]">(live)</span>
        </div>
        {dirty && (
          <span className="mono text-[11px] text-accent-gold uppercase tracking-[0.18em]">
            [ unsaved changes ]
          </span>
        )}
      </div>
      <textarea
        rows={8}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[12px] leading-[1.55] text-text-primary focus:outline-none focus:border-accent-violet resize-none mb-6"
      />

      <div className="mono text-[11px] tracking-[0.22em] text-accent-gold uppercase mb-3">
        TUNABLES
      </div>
      <div className="bg-bg-card border border-border-default rounded-md p-4 mb-6 space-y-3">
        <TunableRow label="Web grounding model">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-bg-input border border-border-default rounded-md px-2 py-1 mono text-[12px] text-text-primary focus:outline-none focus:border-accent-violet"
          >
            <option value="sonar-pro">Sonar Pro</option>
            <option value="sonar">Sonar</option>
            <option value="sonar-reasoning">Sonar Reasoning</option>
          </select>
        </TunableRow>
        <TunableRow label="Max search depth">
          <select
            value={hops}
            onChange={(e) => setHops(e.target.value)}
            className="bg-bg-input border border-border-default rounded-md px-2 py-1 mono text-[12px] text-text-primary focus:outline-none focus:border-accent-violet"
          >
            <option value="1">1 hop</option>
            <option value="2">2 hops</option>
            <option value="3">3 hops</option>
            <option value="5">5 hops</option>
          </select>
        </TunableRow>
        <TunableRow label="Confidence threshold">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-[140px] accent-accent-violet"
            />
            <span className="mono text-[11px] text-text-secondary w-8 text-right">
              {confidence.toFixed(2)}
            </span>
          </div>
        </TunableRow>
        <TunableRow label="Output schema">
          <button className="mono text-[12px] text-text-primary hover:text-accent-violet transition-colors">
            Edit schema →
          </button>
        </TunableRow>
      </div>

      <FieldLabel label="SAFETY">
        <RadioRow
          value={safety}
          onChange={setSafety}
          options={[
            { value: 'closed', label: 'FAIL CLOSED on missing fields' },
            { value: 'open', label: 'FAIL OPEN with warning' },
          ]}
        />
      </FieldLabel>

      <button
        onClick={() => setShowTests(!showTests)}
        className="mono text-[11px] text-text-secondary hover:text-text-primary underline-offset-2 hover:underline"
      >
        {showTests ? 'hide test results ↑' : 'reveal test results ↓'}
      </button>

      {showTests && (
        <div ref={testsRef}>
          <TestResults role={roleName} events={enricherTests} />
        </div>
      )}
    </div>
  );
}

function TunableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="mono text-[12px] text-text-secondary">{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
