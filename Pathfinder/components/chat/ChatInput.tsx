'use client';

// ChatInput — textarea + suggested-prompt chips. Enter submits,
// Shift+Enter inserts a newline. Disabled while the panel is streaming
// an assistant response. Suggested chips come from
// lib/chat/context#suggestedPrompts and rotate as the dashboard view
// changes.

import * as React from 'react';
import { suggestedPrompts } from '@/lib/chat/context';
import type { ChatContextSnapshot } from '@/lib/types';

const PF = {
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
} as const;

export interface ChatInputProps {
  disabled: boolean;
  snapshot: ChatContextSnapshot;
  onSubmit: (message: string) => void;
}

export function ChatInput({ disabled, snapshot, onSubmit }: ChatInputProps) {
  const [value, setValue] = React.useState('');
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const chips = React.useMemo(() => suggestedPrompts(snapshot), [snapshot]);

  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    // Auto-grow textarea up to 6 lines (~140px).
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const submit = React.useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, disabled, onSubmit]);

  const onKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <div
      style={{
        borderTop: `1px solid ${PF.ruleSoft}`,
        padding: '10px 14px 12px',
        background: PF.bg,
      }}
    >
      {/* Suggested-prompt chips. Wrap onto multiple lines as needed. */}
      <div
        className="pf-scrollbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 10,
          maxHeight: 64,
          overflowY: 'auto',
        }}
      >
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            className="pf-pill"
            style={{
              fontSize: 10,
              padding: '4px 8px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
              textTransform: 'none',
              letterSpacing: '0.01em',
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
            }}
            onClick={() => {
              if (disabled) return;
              setValue(c);
              taRef.current?.focus();
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            disabled ? 'Working…' : 'Ask Pathfinder. Shift+Enter for newline.'
          }
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            minHeight: 36,
            padding: '8px 10px',
            border: `1px solid ${PF.ruleSoft}`,
            borderRadius: 4,
            font: '400 13px var(--font-inter), system-ui, sans-serif',
            color: PF.ink,
            background: disabled ? PF.bgAlt : PF.bg,
            outline: 'none',
            lineHeight: 1.4,
          }}
        />
        <button
          type="button"
          className="pf-btn"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          style={{
            opacity: disabled || value.trim().length === 0 ? 0.45 : 1,
            cursor: disabled || value.trim().length === 0 ? 'not-allowed' : 'pointer',
            minWidth: 56,
          }}
        >
          {disabled ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
