import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../SettingsContext';
import { postDecomposition } from '../../lib/architectClient';
import { architectureToSystemConfig } from '../../lib/architectAdapters';
import { listCustomerOrgs } from '../../lib/customersClient';
import { ArchitectCanvas } from './ArchitectCanvas';
import type {
  BusinessSummary,
  DecompositionArchitecture,
  DecompositionResponse,
} from '../../lib/contracts/architect';
import type { SystemConfig } from '../../context/SystemContext';
import { ArchitectureEditor } from './ArchitectureEditor';
import { ApproveDeployModal, deriveDefaultName } from './ApproveDeployModal';
import {
  BusinessSummaryPanel,
  type BusinessSummaryStatus,
} from '../BusinessSummaryPanel';

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
  // Operator-edited business_summary; overrides response.architecture.business_summary
  // until Approve/Deploy. Reset on each new decomposition.
  const [summaryEdits, setSummaryEdits] = useState<BusinessSummary | null>(null);
  // Customer display name — starts blank (panel shows fallback "WHAT THE CUSTOMER GETS")
  // and updates live as the operator types in the ApproveDeployModal name field.
  const [customerDisplayName, setCustomerDisplayName] = useState('');

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
    setSummaryEdits(null);

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

  // Architecture passed forward on Approve/Apply must carry the operator's
  // business_summary edits if any.
  const composeArchitecture = (
    base: DecompositionArchitecture,
  ): DecompositionArchitecture => {
    const summary = summaryEdits ?? base.business_summary;
    return summary ? { ...base, business_summary: summary } : base;
  };

  // APPLY EDITS commits the edited architecture as-is. The modal collects
  // name + slug before the deploy actually happens, so we stash the pending
  // architecture/config and let the modal drive the next step.
  const handleApply = (next: DecompositionArchitecture) => {
    const composed = composeArchitecture(next);
    const nextConfig = architectureToSystemConfig(composed, buyerPain);
    setPending({ architecture: composed, config: { ...nextConfig, status: 'live' } });
    setServerError(null);
  };

  const handleApprove = () => {
    if (!response) return;
    setPending({
      architecture: composeArchitecture(response.architecture),
      config: { ...response.recommendedConfig, status: 'live' },
    });
    setServerError(null);
  };

  const handleSummaryEdit = (
    field: keyof BusinessSummary,
    value: string,
  ) => {
    const baseline =
      summaryEdits ??
      response?.architecture.business_summary ?? {
        lead_type: '',
        business_area: '',
        problem_solved: '',
        what_they_get: '',
      };
    setSummaryEdits({ ...baseline, [field]: value });
  };

  const summaryToRender: BusinessSummary | null =
    summaryEdits ?? response?.architecture.business_summary ?? null;
  const summaryStatus: BusinessSummaryStatus = error
    ? 'error'
    : !response
    ? 'loading'
    : summaryToRender
    ? 'ready'
    : 'error';
  const summaryErrorMessage = error
    ? `Architect error: ${error}. Edit manually below or rerun decomposition.`
    : undefined;

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
      <div className="flex flex-col">
        <div className="relative w-full h-[520px]">
          <ArchitectCanvas
            architecture={response?.architecture ?? null}
            loadingLabel={
              error
                ? 'Architect · decomposition failed'
                : !response
                ? 'Architect · decomposing'
                : undefined
            }
          />
        </div>
        <div className="mt-6 mono text-[11px] uppercase tracking-[0.22em] text-accent-gold flex items-center gap-1">
          <span>{editing ? 'ARCHITECT · EDITING' : 'ARCHITECT · THINKING'}</span>
          {!editing && <Ellipsis />}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <BusinessSummaryPanel
          summary={summaryToRender}
          customerName={customerDisplayName}
          onEdit={handleSummaryEdit}
          status={summaryStatus}
          errorMessage={summaryErrorMessage}
        />

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
                  'bg-accent-primary text-white mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md transition-all',
                  done ? 'hover:bg-accent-primary/90' : 'opacity-40 cursor-not-allowed',
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
          onNameChange={setCustomerDisplayName}
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
