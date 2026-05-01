import { useEffect, useState } from 'react';
import { Visualizer } from '../visualizer/Visualizer';
import { useSettings } from '../SettingsContext';
import { useSystem } from '../../context/SystemContext';
import {
  decompositionConfidence,
  decompositionCostLine,
  decompositionLines,
} from '../../data/mocks';

type Props = {
  buyerPain: string;
  onApprove: () => void;
  onEdit: () => void;
};

export function ArchitectThinking({ buyerPain, onApprove, onEdit }: Props) {
  const { settings } = useSettings();
  const { config } = useSystem();
  void buyerPain;

  const fullLines: string[] = [
    ...decompositionLines,
    ...(settings.showInternalCostMetrics ? [decompositionCostLine] : []),
    decompositionConfidence,
  ];

  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    const start = window.setTimeout(() => {
      let i = 0;
      const interval = window.setInterval(() => {
        i += 1;
        setRevealed(i);
        if (i >= fullLines.length) window.clearInterval(interval);
      }, 60);
      (start as unknown as { _interval?: number })._interval = interval;
    }, 600);

    return () => {
      window.clearTimeout(start);
      const iv = (start as unknown as { _interval?: number })._interval;
      if (iv) window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showInternalCostMetrics]);

  const done = revealed >= fullLines.length;

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

        <pre className="mono text-[12px] leading-[1.65] text-text-primary whitespace-pre-wrap min-h-[420px]">
          {fullLines.slice(0, revealed).map((line, i) => (
            <Line key={i} text={line} />
          ))}
          {!done && (
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
