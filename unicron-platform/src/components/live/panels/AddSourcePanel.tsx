import { useEffect, useState } from 'react';
import { PanelShell } from './PanelShell';
import { SourceTabUrl } from './sub/SourceTabUrl';
import { SourceTabApi } from './sub/SourceTabApi';
import { SourceTabFeed } from './sub/SourceTabFeed';
import { SourceTabFile } from './sub/SourceTabFile';
import { SourceTabDescribe } from './sub/SourceTabDescribe';
import { ArchitectAnalysis } from './sub/ArchitectAnalysis';
import {
  useSystem,
  type AgentDef,
  type DataSource,
} from '../../../context/SystemContext';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = 'url' | 'api' | 'feed' | 'file' | 'describe';

const tabs: { id: Tab; label: string }[] = [
  { id: 'url', label: 'URL' },
  { id: 'api', label: 'API' },
  { id: 'feed', label: 'RSS / FEED' },
  { id: 'file', label: 'FILE' },
  { id: 'describe', label: 'DESCRIBE IT' },
];

export function AddSourcePanel({ open, onClose }: Props) {
  const { addAgent, addDataSource } = useSystem();
  const [tab, setTab] = useState<Tab>('url');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setTab('url');
    setAnalyzing(false);
    setAnalyzed(false);
    setDeploying(false);
  }, [open]);

  const analyze = () => {
    setAnalyzing(true);
    window.setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
    }, 1200);
  };

  const handleDeployWatcher = () => {
    if (deploying) return;
    setDeploying(true);
    const stamp = Date.now();
    const watcherId = `a-permit-sacto-${stamp}`;
    const sourceId = `src-sacto-${stamp}`;
    const watcher: AgentDef = {
      id: watcherId,
      layer: 2,
      role: 'PermitWatcher',
      instruction:
        'Poll Sacramento County permit feed; normalize new filings into structured events.',
      outputTo: ['a-qualifier'],
      dwellMs: 5000,
      passRate: 0.34,
      enabled: true,
    };
    const source: DataSource = {
      id: sourceId,
      type: 'permits',
      label: 'Sacramento County permits',
      jurisdiction: 'Sacramento County',
      pollFrequencyMs: 60 * 60 * 1000,
      enabled: true,
      watcherRole: 'PermitWatcher',
      weight: 0.18,
    };
    addAgent(watcher);
    addDataSource(source);
    window.setTimeout(() => {
      setDeploying(false);
      onClose();
    }, 250);
  };

  return (
    <PanelShell
      open={open}
      title="NEW DATA SOURCE"
      subtitle="Drop in a source. The Architect will figure out how to connect to it."
      onClose={onClose}
      footer={
        analyzed ? (
          <div className="flex items-center justify-between gap-3">
            <button className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md hover:border-border-hover transition-colors">
              EDIT MAPPING
            </button>
            <button className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md hover:border-border-hover transition-colors">
              TEST DRY RUN
            </button>
            <button
              type="button"
              onClick={handleDeployWatcher}
              disabled={deploying}
              className={[
                'mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-colors',
                deploying
                  ? 'bg-white/40 text-bg-base cursor-not-allowed'
                  : 'bg-white text-bg-base hover:bg-text-primary',
              ].join(' ')}
            >
              {deploying ? 'DEPLOYING…' : 'DEPLOY WATCHER'}
            </button>
          </div>
        ) : null
      }
    >
      <div className="border-b border-border-default flex gap-6 mb-6">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'mono text-[11px] tracking-[0.14em] uppercase pb-3 border-b transition-colors',
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

      {tab === 'url' && <SourceTabUrl />}
      {tab === 'api' && <SourceTabApi />}
      {tab === 'feed' && <SourceTabFeed />}
      {tab === 'file' && <SourceTabFile />}
      {tab === 'describe' && <SourceTabDescribe />}

      <div className="mt-2">
        <button
          type="button"
          onClick={analyze}
          disabled={analyzing}
          className={[
            'bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-6 rounded-md transition-colors',
            analyzing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-text-primary',
          ].join(' ')}
        >
          {analyzing ? 'ANALYZING…' : 'ANALYZE WITH ARCHITECT →'}
        </button>
      </div>

      {analyzing && (
        <div className="mt-6 flex items-center gap-2 mono text-[11px] uppercase tracking-[0.22em] text-accent-gold">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-gold animate-pulseDot" />
          Architect inspecting source
        </div>
      )}

      {analyzed && <ArchitectAnalysis />}
    </PanelShell>
  );
}
