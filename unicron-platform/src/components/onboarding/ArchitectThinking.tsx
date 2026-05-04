import { useEffect, useMemo, useRef, useState } from 'react';
import { Visualizer } from '../visualizer/Visualizer';
import { useSettings } from '../SettingsContext';
import { useSystem } from '../../context/SystemContext';
import { postDecomposition } from '../../lib/architectClient';
import { architectureToSystemConfig } from '../../lib/architectAdapters';
import { listCustomerOrgs } from '../../lib/customersClient';
import type {
  DecompositionArchitecture,
  DecompositionResponse,
} from '../../lib/contracts/architect';
import type { SystemConfig } from '../../context/SystemContext';
import { ArchitectureEditor } from './ArchitectureEditor';
import { ApproveDeployModal, deriveDefaultName } from './ApproveDeployModal';

export type ApproveMeta = {
  name: string;
  slug: string;
  architecture: DecompositionArchitecture;
};

type Props = {
  buyerPain: string;
  onApprove: (config: SystemConfig, meta: ApproveMeta) => Promise<void> | void;
};

const REVEAL_INTERVAL_MS = 60;

export function ArchitectThinking({ buyerPain, onApprove }: Props) {
  const { settings } = useSettings();
  const { config } = useSystem();
  const [response, setResponse] = useState<DecompositionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<{
    architecture: DecompositionArchitecture;
    config: SystemConfig;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Reset on buyerPain change so a new decomposition starts clean.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResponse(null);
    setError(null);
    setRevealed(0);
    setEditing(false);
    setPending(null);
    setServerError(null);

    postDecomposition({ buyerPain })
      .then((res) => {
        if (cancelled) return;
        setResponse(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [buyerPain]);

  // Prefetch existing slugs so the modal can validate uniqueness offline.
  useEffect(() => {
    let cancelled = false;
    listCustomerOrgs()
      .then((orgs) => {
        if (cancelled) return;
        setExistingSlugs(orgs.map((o) => o.slug));
      })
      .catch(() => {
        // Non-fatal — modal still validates server-side via SlugConflictError.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lines = useStableLines(response, settings.showInternalCostMetrics);
  const total = lines.length;
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!total) return;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setRevealed((curr) => {
        if (curr >= total) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          return curr;
        }
        return curr + 1;
      });
    }, REVEAL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [total]);

  const done = total > 0 && revealed >= total;

  // APPLY EDITS commits the edited architecture as-is. The modal collects
  // name + slug before the deploy actually happens, so we stash the pending
  // architecture/config and let the modal drive the next step.
  const handleApply = (next: DecompositionArchitecture) => {
    const nextConfig = architectureToSystemConfig(next, buyerPain);
    setPending({ architecture: next, config: { ...nextConfig, status: 'live' } });
    setServerError(null);
  };

  const handleApprove = () => {
    if (!response) return;
    setPending({
      architecture: response.architecture,
      config: { ...response.recommendedConfig, status: 'live' },
    });
    setServerError(null);
  };

  const handleConfirm = async ({ name, slug }: { name: string; slug: string }) => {
    if (!pending) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onApprove(pending.config, {
        name,
        slug,
        architecture: pending.architecture,
      });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
    // On success, the parent navigates away — no need to clear local state.
  };

  return (
    <div className="w-full max-w-[1180px] px-6 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-10 items-start py-12">
      <div className="flex flex-col items-center justify-center">
        <div className="relative w-[420px] h-[420px]">
          <Visualizer
            config={config}
            showInternalCostMetrics={false}
            reducedMotion={settings.reducedMotion}
            density="compact"
            showHud={false}
          />
        </div>
        <div className="mt-6 mono text-[11px] uppercase tracking-[0.22em] text-accent-gold flex items-center gap-1">
          <span>{editing ? 'ARCHITECT · EDITING' : 'ARCHITECT · THINKING'}</span>
          {!editing && <Ellipsis />}
        </div>
      </div>

      <div className="bg-bg-card border border-border-default rounded-lg p-6">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-4">
          {editing ? 'ARCHITECT · EDIT ARCHITECTURE' : 'ARCHITECT · DECOMPOSING'}
        </div>

        {error && (
          <div className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3 mb-3">
            architect error: {error}
          </div>
        )}

        {editing && response ? (
          <ArchitectureEditor
            architecture={response.architecture}
            onApply={handleApply}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <pre className="mono text-[12px] leading-[1.65] text-text-primary whitespace-pre-wrap min-h-[420px]">
              {lines.slice(0, revealed).map((line, i) => (
                <Line key={i} text={line} />
              ))}
              {!done && !error && (
                <span className="inline-block w-[6px] h-[12px] bg-accent-gold align-baseline animate-pulseDot" />
              )}
            </pre>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                disabled={!done}
                onClick={handleApprove}
                className={[
                  'bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md transition-all',
                  done ? 'hover:bg-text-primary' : 'opacity-40 cursor-not-allowed',
                ].join(' ')}
              >
                APPROVE & DEPLOY
              </button>
              <button
                type="button"
                disabled={!response}
                onClick={() => setEditing(true)}
                className={[
                  'border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md transition-colors',
                  response ? 'hover:border-border-hover' : 'opacity-40 cursor-not-allowed',
                ].join(' ')}
              >
                EDIT ARCHITECTURE
              </button>
            </div>
          </>
        )}
      </div>

      {pending ? (
        <ApproveDeployModal
          defaultName={deriveDefaultName(buyerPain)}
          existingSlugs={existingSlugs}
          submitting={submitting}
          serverError={serverError}
          onCancel={() => {
            if (submitting) return;
            setPending(null);
          }}
          onConfirm={handleConfirm}
        />
      ) : null}
    </div>
  );
}

function useStableLines(
  response: DecompositionResponse | null,
  includeCost: boolean,
): string[] {
  return useMemo(() => {
    if (!response) return [];
    return response.lines
      .filter((l) => includeCost || l.kind !== 'cost')
      .map((l) => l.text);
  }, [response, includeCost]);
}

function Line({ text }: { text: string }) {
  if (text.includes('[INTERNAL ONLY]')) {
    const idx = text.indexOf('[INTERNAL ONLY]');
    return (
      <span className="block">
        {text.slice(0, idx)}
        <span className="text-accent-gold">[INTERNAL ONLY]</span>
      </span>
    );
  }
  return <span className="block">{text || ' '}</span>;
}

function Ellipsis() {
  return (
    <span className="inline-flex">
      <span className="animate-ellipsis" style={{ animationDelay: '0s' }}>
        .
      </span>
      <span className="animate-ellipsis" style={{ animationDelay: '0.2s' }}>
        .
      </span>
      <span className="animate-ellipsis" style={{ animationDelay: '0.4s' }}>
        .
      </span>
    </span>
  );
}
