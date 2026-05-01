import { useEffect, useState } from 'react';
import { PanelShell } from './PanelShell';
import { EditNodeOverview } from './sub/EditNodeOverview';
import { EditNodeEdit } from './sub/EditNodeEdit';
import { EditNodeTest } from './sub/EditNodeTest';
import { EditNodeHistory } from './sub/EditNodeHistory';
import { enricherInitialInstruction } from '../../../data/mocks';
import { useSystem, type AgentDef } from '../../../context/SystemContext';

type Props = {
  open: boolean;
  onClose: () => void;
  selectedAgentId?: string | null;
  onAgentUpdated?: (agentId: string) => void;
};

type SubTab = 'overview' | 'edit' | 'test' | 'history';

const subTabs: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'edit', label: 'EDIT' },
  { id: 'test', label: 'TEST' },
  { id: 'history', label: 'HISTORY' },
];

const SHAPE_BY_LAYER: Record<2 | 3 | 4, string> = {
  2: '⬢',
  3: '◆',
  4: '⯃',
};
const SHAPE_COLOR_BY_LAYER: Record<2 | 3 | 4, string> = {
  2: 'text-accent-cyan',
  3: 'text-accent-gold',
  4: 'text-red-400',
};
const LAYER_LABEL: Record<2 | 3 | 4, string> = {
  2: 'Layer 2 · Watcher',
  3: 'Layer 3 · Signal',
  4: 'Layer 4 · Synthesis',
};

function pickFallbackAgent(agents: AgentDef[]): AgentDef | undefined {
  return agents.find((a) => a.role === 'Enricher') ?? agents.find((a) => a.layer === 3) ?? agents[0];
}

export function EditNodePanel({ open, onClose, selectedAgentId, onAgentUpdated }: Props) {
  const [tab, setTab] = useState<SubTab>('edit');
  const [instruction, setInstruction] = useState(enricherInitialInstruction);
  const [showTests, setShowTests] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const { config, updateAgent } = useSystem();

  const selected: AgentDef | undefined = selectedAgentId
    ? config.agents.find((a) => a.id === selectedAgentId) ?? pickFallbackAgent(config.agents)
    : pickFallbackAgent(config.agents);

  // Sync local edit state when the selected agent changes (panel opens or different node clicked).
  useEffect(() => {
    if (selected?.instruction) setInstruction(selected.instruction);
    setTab('edit');
    setShowTests(false);
  }, [selected?.id]);

  const baseInstruction = selected?.instruction ?? enricherInitialInstruction;
  const dirty = instruction !== baseInstruction;

  const layer = (selected?.layer ?? 3) as 2 | 3 | 4;
  const shape = SHAPE_BY_LAYER[layer];
  const shapeColor = SHAPE_COLOR_BY_LAYER[layer];
  const layerLabel = LAYER_LABEL[layer];
  const displayName = selected?.role ?? 'Enricher';

  const handleSaveLive = () => {
    if (!selected) return;
    updateAgent(selected.id, { instruction });
    onAgentUpdated?.(selected.id);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1400);
  };

  const handleHistoryRevert = (oldInstruction: string) => {
    if (!selected) return;
    updateAgent(selected.id, { instruction: oldInstruction });
    setInstruction(oldInstruction);
    onAgentUpdated?.(selected.id);
  };

  return (
    <PanelShell
      open={open}
      title={displayName}
      onClose={onClose}
      header={
        <div>
          <div className="flex items-center gap-2.5">
            <span className={[shapeColor, 'text-[16px] leading-none'].join(' ')}>{shape}</span>
            <span className="text-[17px] text-text-primary">{displayName}</span>
            <span className="mono text-[11px] text-text-secondary">· {layerLabel}</span>
          </div>
          <div className="mono text-[11px] text-text-secondary mt-1.5">
            instance_id: {selected?.id ?? 'signal-enricher-04'}
          </div>
          <div className="mono text-[11px] text-text-secondary mt-0.5">
            status: <span className="text-text-primary/85">idle</span> · last fired{' '}
            <span className="text-text-primary/85">8s ago</span> ·{' '}
            <span className="text-text-primary/85">1,247</span> lifetime events
          </div>

          <div className="mt-4 flex gap-6 -mb-px">
            {subTabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={[
                    'mono text-[11px] tracking-[0.16em] uppercase pb-3 border-b transition-colors',
                    active
                      ? 'text-text-primary border-text-primary'
                      : 'text-text-primary/40 border-transparent hover:text-text-primary/70',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      }
      footer={
        tab === 'edit' ? (
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setInstruction(baseInstruction)}
              disabled={!dirty}
              className={[
                'border mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-colors',
                dirty
                  ? 'border-border-default text-text-primary hover:border-border-hover'
                  : 'border-border-default/40 text-text-secondary/40 cursor-not-allowed',
              ].join(' ')}
            >
              REVERT
            </button>
            <button
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
              title="applies to next event, no redeploy needed"
              onClick={handleSaveLive}
              disabled={!dirty}
              className={[
                'mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-colors',
                dirty
                  ? 'bg-white text-bg-base hover:bg-text-primary'
                  : 'bg-white/40 text-bg-base cursor-not-allowed',
              ].join(' ')}
            >
              {savedFlash ? 'SAVED ✓' : 'SAVE LIVE'}
            </button>
          </div>
        ) : null
      }
    >
      {tab === 'overview' && <EditNodeOverview agent={selected} />}
      {tab === 'edit' && (
        <EditNodeEdit
          instruction={instruction}
          setInstruction={setInstruction}
          showTests={showTests}
          setShowTests={setShowTests}
          baseInstruction={baseInstruction}
          roleName={displayName}
        />
      )}
      {tab === 'test' && <EditNodeTest />}
      {tab === 'history' && <EditNodeHistory onRevert={handleHistoryRevert} />}
    </PanelShell>
  );
}
