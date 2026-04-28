'use client';

// Field — shared layout primitives for settings rows. Label + description
// + control on the right, hairline divider between rows.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

export function Card({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: hexAlpha('#000000', 0.20),
        border: `1px solid ${hexAlpha('#ffffff', 0.08)}`,
        borderRadius: PF_TINTS.r.md,
        marginBottom: 16,
      }}
    >
      <header
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${hexAlpha('#ffffff', 0.06)}`,
        }}
      >
        <h3
          style={{
            margin: 0,
            font: `600 14px ${PF_TINTS.sans}`,
            color: PF_TINTS.mapInk,
            letterSpacing: '-0.005em',
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              margin: '4px 0 0',
              font: `400 12px/1.4 ${PF_TINTS.sans}`,
              color: PF_TINTS.mapInkDim,
            }}
          >
            {description}
          </p>
        )}
      </header>
      <div>{children}</div>
      {footer && (
        <footer
          style={{
            padding: '12px 18px',
            borderTop: `1px solid ${hexAlpha('#ffffff', 0.06)}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {footer}
        </footer>
      )}
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '14px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        columnGap: 24,
        alignItems: 'center',
        borderTop: `1px solid ${hexAlpha('#ffffff', 0.04)}`,
      }}
    >
      <div>
        <div
          style={{
            font: `500 13px ${PF_TINTS.sans}`,
            color: PF_TINTS.mapInk,
            marginBottom: hint ? 2 : 0,
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              font: `400 11px/1.4 ${PF_TINTS.sans}`,
              color: PF_TINTS.mapInkDim,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        background: checked ? '#9d35ff' : hexAlpha('#ffffff', 0.16),
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 120ms ease',
        }}
      />
    </button>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        background: hexAlpha('#000000', 0.30),
        color: PF_TINTS.mapInk,
        border: `1px solid ${hexAlpha('#ffffff', 0.12)}`,
        borderRadius: 3,
        padding: '6px 10px',
        font: `500 12px ${PF_TINTS.sans}`,
        cursor: 'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles: React.CSSProperties = {
    primary: {
      background: '#9d35ff',
      color: '#fff',
      border: '1px solid #9d35ff',
    },
    ghost: {
      background: 'transparent',
      color: PF_TINTS.mapInk,
      border: `1px solid ${hexAlpha('#ffffff', 0.16)}`,
    },
    danger: {
      background: 'transparent',
      color: '#f87171',
      border: `1px solid ${hexAlpha('#f87171', 0.4)}`,
    },
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles,
        padding: '6px 14px',
        borderRadius: 3,
        font: `500 12px ${PF_TINTS.sans}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

export function Phase2Banner({ note }: { note?: string }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        background: hexAlpha('#9d35ff', 0.08),
        border: `1px dashed ${hexAlpha('#9d35ff', 0.35)}`,
        borderRadius: PF_TINTS.r.sm,
        margin: '12px 18px 18px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <span
        className="pf-mono"
        style={{
          fontSize: 9,
          color: '#9d35ff',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          padding: '2px 6px',
          border: `1px solid ${hexAlpha('#9d35ff', 0.4)}`,
          borderRadius: 2,
          flexShrink: 0,
        }}
      >
        Phase 2
      </span>
      <span style={{ font: `400 12px/1.5 ${PF_TINTS.sans}`, color: PF_TINTS.mapInkDim }}>
        {note ?? 'Coming in Phase 2 — ships with the Zedcor production rollout.'}
      </span>
    </div>
  );
}
