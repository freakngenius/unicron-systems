import { useEffect, useState } from 'react';
import { PanelShell } from './PanelShell';
import { SourceTabUrl } from './sub/SourceTabUrl';
import { SourceTabApi } from './sub/SourceTabApi';
import { SourceTabFeed } from './sub/SourceTabFeed';
import { SourceTabFile } from './sub/SourceTabFile';
import { SourceTabDescribe } from './sub/SourceTabDescribe';
import { ArchitectAnalysis } from './sub/ArchitectAnalysis';
import { useSystem } from '../../../context/SystemContext';
import { analyze as runAnalyze, deploy as runDeploy } from '../../../lib/sourceOnboarderClient';
import type {
  AnalysisResponse,
  SourceTabKind,
} from '../../../lib/contracts/sourceOnboarder';

type Props = {
  open: boolean;
  onClose: () => void;
};

const tabs: { id: SourceTabKind; label: string }[] = [
  { id: 'url', label: 'URL' },
  { id: 'api', label: 'API' },
  { id: 'feed', label: 'RSS / FEED' },
  { id: 'file', label: 'FILE' },
  { id: 'describe', label: 'DESCRIBE IT' },
];

// TODO[stream-e-contract,src/components/live/panels/AddSourcePanel.tsx:62]:
// When VITE_SOURCE_ONBOARDER_ENABLED=true, runDeploy() will hit Stream E's
// /deploy endpoint and the response carries the canonical {source, watcher}
// pair. Until E ships, the mock client returns the analysis's proposed
// source + watcher as a stand-in. Both paths use addAgent + addDataSource
// to keep SystemContext in sync.

export function AddSourcePanel({ open, onClose }: Props) {
  const { addAgent, addDataSource } = useSystem();
  const [tab, setTab] = useState<SourceTabKind>('url');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('url');
    setAnalyzing(false);
    setAnalysis(null);
    setDeploying(false);
    setError(null);
  }, [open]);

  const onAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await runAnalyze({ tab, input: '' });
      setAnalysis(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeployWatcher = async () => {
    if (deploying || !analysis) return;
    setDeploying(true);
    setError(null);
    try {
      const res = await runDeploy({ analysisId: analysis.analysisId });
      addAgent(res.watcher);
      addDataSource(res.source);
      window.setTimeout(() => {
        setDeploying(false);
        onClose();
      }, 250);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setDeploying(false);
    }
  };

  const analyzed = Boolean(analysis);

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
          onClick={onAnalyze}
          disabled={analyzing}
          className={[
            'bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-6 rounded-md transition-colors',
            analyzing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-text-primary',
          ].join(' ')}
        >
          {analyzing ? 'ANALYZING…' : 'ANALYZE WITH ARCHITECT →'}
        </button>
      </div>

      {error && (
        <div className="mt-4 mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3">
          source-onboarder error: {error}
        </div>
      )}

      {analyzing && (
        <div className="mt-6 flex items-center gap-2 mono text-[11px] uppercase tracking-[0.22em] text-accent-gold">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-gold animate-pulseDot" />
          Architect inspecting source
        </div>
      )}

      {analysis && <ArchitectAnalysis />}
    </PanelShell>
  );
}
