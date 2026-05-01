import type { ReactNode } from 'react';

export function FieldLabel({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 mb-5">
      <div className="mono text-[11px] tracking-[0.22em] text-accent-gold uppercase">
        {label}
        {optional && <span className="ml-2 text-text-secondary normal-case tracking-[0.08em]">(optional)</span>}
      </div>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'password';
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-accent-violet"
    />
  );
}

export function RadioRow<T extends string>({
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
