import { useEffect, useRef, useState } from 'react';
import { Visualizer } from '../visualizer/Visualizer';
import { useSettings } from '../SettingsContext';
import { useSystem } from '../../context/SystemContext';
import { postDecomposition } from '../../lib/architectClient';
import type { DecompositionResponse } from '../../lib/contracts/architect';

type Props = {
  buyerPain: string;
  onApprove: () => void;
  onEdit: () => void;
};

const REVEAL_INTERVAL_MS = 60;

export function ArchitectThinking({ buyerPain, onApprove, onEdit }: Props) {
  const { settings } = useSettings();
  const { config } = useSystem();
  const [response, setResponse] = useState<DecompositionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  // TODO[stream-d-contract,src/components/onboarding/ArchitectThinking.tsx:23]:
  // When VITE_ARCHITECT_API_ENABLED=true, postDecomposition() will hit
  // Stream D's /decomposition endpoint. The mock fixture below is shaped
  // identically; no UI change is needed when D ships. See
  // src/lib/contracts/architect.ts for the canonical type.

  useEffect(() => {
    let cancelled = false;
    setResponse(null);
    setError(null);
    setRevealed(0);

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

  // Filter out the cost line when the operator hasn't opted into internal
  // metrics. Drift from the original mock-only behavior: we still respect
  // the `showInternalCostMetrics` setting even though Stream D will return
  // the cost line unconditionally.
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
          <span>ARCHITECT · THINKING</span>
          <Ellipsis />
        </div>
      </div>

      <div className="bg-bg-card border border-border-default rounded-lg p-6">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-4">
          ARCHITECT · DECOMPOSING
        </div>

        {error && (
          <div className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3 mb-3">
            architect error: {error}
          </div>
        )}

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
            onClick={onApprove}
            className={[
              'bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md transition-all',
              done ? 'hover:bg-text-primary' : 'opacity-40 cursor-not-allowed',
            ].join(' ')}
          >
            APPROVE & DEPLOY
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md hover:border-border-hover transition-colors"
          >
            EDIT ARCHITECTURE
          </button>
        </div>
      </div>
    </div>
  );
}

function useStableLines(
  response: DecompositionResponse | null,
  includeCost: boolean,
): string[] {
  if (!response) return [];
  return response.lines
    .filter((l) => includeCost || l.kind !== 'cost')
    .map((l) => l.text);
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
