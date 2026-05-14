import { useEffect, useRef, useState } from 'react';
import { placeholderExamples } from '../../data/mocks';

type Props = {
  onSubmit: (prompt: string) => void;
};

export function DefinePain({ onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [phIndex, setPhIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (value.length > 0) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % placeholderExamples.length);
    }, 4000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [value]);

  const placeholder = placeholderExamples[phIndex];
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <div className="w-full max-w-[720px] px-6">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-6">
        01 / DEFINE
      </div>

      <h1 className="text-[32px] leading-[1.15] font-normal text-text-primary mb-3">
        What kind of signals do you want to capture?
      </h1>

      <p className="text-[15px] text-text-secondary mb-8 max-w-[600px]">
        Describe a buyer, a buying signal, or a problem worth solving. The Architect will design the
        system to find it.
      </p>

      <textarea
        rows={8}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-input border border-border-default rounded-md p-4 mono text-[14px] text-text-primary placeholder:text-text-primary/35 focus:outline-none focus:border-accent-violet transition-colors resize-none mb-6"
      />

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className={[
            'bg-accent-primary text-white mono text-[12px] tracking-[0.12em] uppercase py-3 px-6 rounded-md transition-colors',
            canSubmit ? 'hover:bg-accent-primary/90' : 'opacity-40 cursor-not-allowed',
          ].join(' ')}
        >
          LET ARCHITECT DESIGN IT →
        </button>
        <button
          type="button"
          className="mono text-[12px] text-text-secondary hover:text-text-primary hover:underline transition-colors"
        >
          or start from a template
        </button>
      </div>
    </div>
  );
}
