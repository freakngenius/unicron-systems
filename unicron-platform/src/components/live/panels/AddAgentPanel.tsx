import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanelShell } from './PanelShell';
import { TestResults } from './sub/TestResults';
import { subcontractorIntelTests } from '../../../data/mocks';
import { useSystem, type AgentDef, type AgentLayer } from '../../../context/SystemContext';

type Props = {
  open: boolean;
  onClose: () => void;
};

type LayerKey = 'watchers' | 'signal' | 'synthesis';
type RoleType = 'template' | 'custom';

const LAYER_BY_KEY: Record<LayerKey, AgentLayer> = {
  watchers: 2,
  signal: 3,
  synthesis: 4,
};

const drafts = [
  {
    name: 'SubcontractorIntel',
    layer: 'signal' as LayerKey,
    instruction: `When a qualified event arrives from GeoMapper, identify
whether the GC routes security through a single
subcontractor relationship. If so, surface the
subcontractor's name, contact, and recent project
history. Output: enriched event with
\`subcontractor_relationship\` field populated.`,
    inputRole: 'GeoMapper',
    outputRole: 'Ranker',
  },
  {
    name: 'RelationshipMapper',
    layer: 'signal' as LayerKey,
    instruction: `When a qualified event arrives from GeoMapper, map all
known relationships between the GC, project owner, and
the broader contractor network. Surface relationship
density, exclusivity patterns, and historical co-bidding
behavior. Output: enriched event with
\`relationship_graph\` field populated.`,
    inputRole: 'GeoMapper',
    outputRole: 'Ranker',
  },
];

export function AddAgentPanel({ open, onClose }: Props) {
  const { config, addAgent } = useSystem();
  const [draftIdx, setDraftIdx] = useState(0);
  const [name, setName] = useState(drafts[0].name);
  const [instruction, setInstruction] = useState(drafts[0].instruction);
  const [layerKey, setLayerKey] = useState<LayerKey>(drafts[0].layer);
  const [roleType, setRoleType] = useState<RoleType>('custom');
  const [inputFromRole, setInputFromRole] = useState(drafts[0].inputRole);
  const [outputToRole, setOutputToRole] = useState(drafts[0].outputRole);
  const [showTests, setShowTests] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const testsRef = useRef<HTMLDivElement>(null);

  // Reset to draft 0 each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setDraftIdx(0);
    setName(drafts[0].name);
    setInstruction(drafts[0].instruction);
    setLayerKey(drafts[0].layer);
    setInputFromRole(drafts[0].inputRole);
    setOutputToRole(drafts[0].outputRole);
    setShowTests(false);
  }, [open]);

  useEffect(() => {
    if (showTests && testsRef.current) {
      testsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showTests]);

  const flipDraft = () => {
    const next = (draftIdx + 1) % drafts.length;
    setDraftIdx(next);
    setName(drafts[next].name);
    setInstruction(drafts[next].instruction);
    setLayerKey(drafts[next].layer);
    setInputFromRole(drafts[next].inputRole);
    setOutputToRole(drafts[next].outputRole);
  };

  const targetLayer = LAYER_BY_KEY[layerKey];
  const upstreamLayer = (targetLayer - 1) as 1 | 2 | 3;
  const downstreamLayer = (targetLayer + 1) as 3 | 4 | 5;

  const inputCandidates = useMemo(
    () => config.agents.filter((a) => a.layer === upstreamLayer && a.enabled),
    [config.agents, upstreamLayer],
  );
  const outputCandidates = useMemo(
    () => config.agents.filter((a) => a.layer === downstreamLayer && a.enabled),
    [config.agents, downstreamLayer],
  );

  const draftDirty = (k: keyof (typeof drafts)[number], v: unknown) =>
    drafts[draftIdx][k as keyof (typeof drafts)[number]] !== v;

  const revertField = (which: 'name' | 'instruction' | 'layer' | 'roleType' | 'inputFrom' | 'outputTo') => {
    if (which === 'name') setName(drafts[draftIdx].name);
    if (which === 'instruction') setInstruction(drafts[draftIdx].instruction);
    if (which === 'layer') setLayerKey(drafts[draftIdx].layer);
    if (which === 'roleType') setRoleType('custom');
    if (which === 'inputFrom') setInputFromRole(drafts[draftIdx].inputRole);
    if (which === 'outputTo') setOutputToRole(drafts[draftIdx].outputRole);
  };

  const handleDeploy = () => {
    if (deploying) return;
    setDeploying(true);
    const dwellByLayer: Record<AgentLayer, number> = { 2: 5000, 3: 8000, 4: 10000 };
    const passByLayer: Record<AgentLayer, number> = { 2: 0.3, 3: 0.5, 4: 0.85 };
    const inputAgent = inputCandidates.find((a) => a.role === inputFromRole);
    const outputAgent = outputCandidates.find((a) => a.role === outputToRole);
    const newAgent: AgentDef = {
      id: `a-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      layer: targetLayer,
      role: name,
      instruction,
      inputFrom: inputAgent ? [inputAgent.id] : undefined,
      outputTo: outputAgent ? [outputAgent.id] : undefined,
      dwellMs: dwellByLayer[targetLayer],
      passRate: passByLayer[targetLayer],
      enabled: true,
    };
    addAgent(newAgent);
    window.setTimeout(() => {
      setDeploying(false);
      onClose();
    }, 250);
  };

  return (
    <PanelShell
      open={open}
      title="NEW AGENT"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={flipDraft}
            className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md hover:border-border-hover transition-colors"
          >
            DRAFT
          </button>
          <button
            type="button"
            onClick={() => setShowTests((v) => !v)}
            className={[
              'border mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-colors',
              showTests
                ? 'border-accent-gold/60 text-accent-gold'
                : 'border-border-default text-text-primary hover:border-border-hover',
            ].join(' ')}
          >
            TEST ON 10 RECENT
          </button>
          <button
            type="button"
            onClick={handleDeploy}
            disabled={deploying || !name.trim()}
            className={[
              'mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-colors',
              deploying || !name.trim()
                ? 'bg-white/40 text-bg-base cursor-not-allowed'
                : 'bg-white text-bg-base hover:bg-text-primary',
            ].join(' ')}
          >
            {deploying ? 'DEPLOYING…' : 'DEPLOY'}
          </button>
        </div>
      }
    >
      <div className="bg-accent-gold/10 border border-accent-gold/30 rounded-md p-4 mb-6">
        <div className="mono text-[11px] text-accent-gold tracking-[0.18em] uppercase mb-2">
          ✦ ARCHITECT DRAFTED THIS
        </div>
        <p className="mono text-[11px] text-text-primary/80 leading-[1.55]">
          Based on patterns it sees in your system. Edit anything before deploying.
        </p>
        <button
          onClick={flipDraft}
          className="mt-3 mono text-[11px] text-text-primary/60 hover:text-text-primary hover:underline transition-colors"
        >
          Draft a different version →
        </button>
      </div>

      <Field
        label="NAME"
        sparkleOn={draftDirty('name', name)}
        onRevert={() => revertField('name')}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-violet"
        />
      </Field>

      <Field
        label="LAYER"
        sparkleOn={draftDirty('layer', layerKey)}
        onRevert={() => revertField('layer')}
      >
        <RadioGroup
          value={layerKey}
          onChange={(v) => setLayerKey(v as LayerKey)}
          options={[
            { value: 'watchers', label: 'WATCHERS' },
            { value: 'signal', label: 'SIGNAL' },
            { value: 'synthesis', label: 'SYNTHESIS' },
          ]}
        />
      </Field>

      <Field
        label="ROLE TYPE"
        sparkleOn={roleType !== 'custom'}
        onRevert={() => revertField('roleType')}
      >
        <RadioGroup
          value={roleType}
          onChange={(v) => setRoleType(v as RoleType)}
          options={[
            { value: 'template', label: 'USE EXISTING TEMPLATE' },
            { value: 'custom', label: 'NEW CUSTOM ROLE' },
          ]}
        />
      </Field>

      <Field
        label="INSTRUCTION"
        sparkleOn={draftDirty('instruction', instruction)}
        onRevert={() => revertField('instruction')}
      >
        <textarea
          rows={8}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[12px] leading-[1.55] text-text-primary focus:outline-none focus:border-accent-violet resize-none"
        />
      </Field>

      <Field
        label="INPUT FROM"
        sparkleOn={draftDirty('inputRole', inputFromRole)}
        onRevert={() => revertField('inputFrom')}
      >
        <select
          value={inputFromRole}
          onChange={(e) => setInputFromRole(e.target.value)}
          disabled={inputCandidates.length === 0}
          className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-violet disabled:opacity-50"
        >
          {inputCandidates.length === 0 ? (
            <option value="">no upstream agents</option>
          ) : (
            inputCandidates.map((a) => (
              <option key={a.id} value={a.role}>
                {a.role} · Layer {a.layer}
              </option>
            ))
          )}
        </select>
      </Field>

      <Field
        label="OUTPUT TO"
        sparkleOn={draftDirty('outputRole', outputToRole)}
        onRevert={() => revertField('outputTo')}
        last
      >
        <select
          value={outputToRole}
          onChange={(e) => setOutputToRole(e.target.value)}
          disabled={outputCandidates.length === 0}
          className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-violet disabled:opacity-50"
        >
          {outputCandidates.length === 0 ? (
            <option value="">routes to delivery</option>
          ) : (
            outputCandidates.map((a) => (
              <option key={a.id} value={a.role}>
                {a.role} · Layer {a.layer}
              </option>
            ))
          )}
        </select>
      </Field>

      {showTests && (
        <div ref={testsRef}>
          <TestResults role={name || 'Agent'} events={subcontractorIntelTests} />
        </div>
      )}
    </PanelShell>
  );
}

function Field({
  label,
  children,
  sparkleOn,
  onRevert,
  last,
}: {
  label: string;
  children: ReactNode;
  sparkleOn?: boolean;
  onRevert?: () => void;
  last?: boolean;
}) {
  return (
    <div className={['flex flex-col gap-2', last ? 'mb-2' : 'mb-5'].join(' ')}>
      <div className="mono text-[11px] tracking-[0.22em] text-accent-gold uppercase">{label}</div>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        <Sparkle modified={!!sparkleOn} onClick={onRevert} />
      </div>
    </div>
  );
}

function Sparkle({ modified, onClick }: { modified: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        modified
          ? 'Architect suggested this. Click to revert.'
          : 'Architect suggested this. Click to revert if changed.'
      }
      className={[
        'flex-shrink-0 mt-2 w-5 h-5 flex items-center justify-center rounded-sm transition-colors',
        modified
          ? 'text-accent-gold/40 hover:text-accent-gold hover:bg-accent-gold/10'
          : 'text-accent-gold hover:bg-accent-gold/10',
      ].join(' ')}
      aria-label="Architect suggestion"
    >
      ✦
    </button>
  );
}

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              'mono text-[11px] tracking-[0.12em] uppercase py-2 px-3 rounded-md border transition-colors',
              active
                ? 'border-text-primary text-text-primary bg-white/[0.04]'
                : 'border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
