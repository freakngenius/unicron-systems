'use client';

// ChatInput — textarea + the SUGGESTIONS list. Enter submits,
// Shift+Enter inserts a newline. Disabled while the panel is streaming
// an assistant response.
//
// Gate 23 — consolidated the prior chip-row + bullet-list into a single
// 5-item SUGGESTIONS list with one branch-aware prompt. Default branch
// is Houston (DEMO_HOUSTON_ONLY=1 demo flagship).

import * as React from 'react';
import type { Branch, ChatContextSnapshot } from '@/lib/types';

const PF = {
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
} as const;

// Gate 23 — single consolidated list of 5 suggestions in the exact
// order specified. Suggestion #2 carries `{branch}`; the rest render
// verbatim. Click dispatches the rendered text via onSubmit.
const SUGGESTIONS: ReadonlyArray<{ template: string; hasBranch: boolean }> = [
  {
    template: 'What are the newest leads within the last 3 days?',
    hasBranch: false,
  },
  {
    template: 'Show me top leads in {branch}.',
    hasBranch: true,
  },
  {
    template: 'Which bid windows are about to expire?',
    hasBranch: false,
  },
  {
    template: 'Give me an update on my leads in Hubspot.',
    hasBranch: false,
  },
  {
    template: "Summarize this week's pipeline for me.",
    hasBranch: false,
  },
];

const DEFAULT_DEMO_BRANCH = 'Houston';

export interface ChatInputProps {
  disabled: boolean;
  snapshot: ChatContextSnapshot;
  onSubmit: (message: string) => void;
  branches?: Pick<Branch, 'id' | 'name' | 'code'>[];
}

export function ChatInput({ disabled, snapshot, onSubmit, branches }: ChatInputProps) {
  const [value, setValue] = React.useState('');
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Default the suggestion branch token to the currently selected
  // branch (if any, and if it's a known branch name) — otherwise fall
  // back to Houston per the demo flagship.
  const selectedBranchName = React.useMemo(() => {
    if (!snapshot.selectedBranchId || !branches) return null;
    const b = branches.find((x) => x.id === snapshot.selectedBranchId);
    return b?.name ?? null;
  }, [snapshot.selectedBranchId, branches]);

  const [demoBranch, setDemoBranch] = React.useState<string>(
    selectedBranchName ?? DEFAULT_DEMO_BRANCH,
  );

  // Re-sync the suggestion branch when the dashboard selection changes.
  // Users can still override via the dropdown.
  React.useEffect(() => {
    if (selectedBranchName) setDemoBranch(selectedBranchName);
  }, [selectedBranchName]);

  const branchOptions = React.useMemo(() => {
    const fromProps = (branches ?? [])
      .map((b) => b.name)
      .filter((n): n is string => Boolean(n));
    // Always include Houston so the demo defaults work even if the
    // workspace's branch list is loading or empty.
    const set = new Set<string>([DEFAULT_DEMO_BRANCH, ...fromProps]);
    return Array.from(set).sort((a, b) =>
      a === DEFAULT_DEMO_BRANCH ? -1 : b === DEFAULT_DEMO_BRANCH ? 1 : a.localeCompare(b),
    );
  }, [branches]);

  const renderSuggestion = React.useCallback(
    (template: string) => template.replace(/\{branch\}/g, demoBranch),
    [demoBranch],
  );

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
      {/* Gate 23 — single consolidated SUGGESTIONS list. 5 prompts in
          fixed order; suggestion #2 dynamically reflects the selected
          branch. Each row click dispatches the rendered text via
          onSubmit (preserving existing send flow). */}
      <div
        data-testid="chat-suggestions"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: `1px dashed ${PF.ruleSoft}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            className="pf-meta"
            style={{ color: PF.inkFaint, fontSize: 9, letterSpacing: '0.08em' }}
          >
            SUGGESTIONS
          </span>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: PF.inkDim,
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
            }}
          >
            <span>Branch</span>
            <select
              aria-label="Suggestion branch"
              value={demoBranch}
              disabled={disabled}
              onChange={(e) => setDemoBranch(e.target.value)}
              style={{
                font: '500 10px var(--font-inter), system-ui, sans-serif',
                padding: '2px 4px',
                border: `1px solid ${PF.ruleSoft}`,
                borderRadius: 3,
                background: disabled ? PF.bgAlt : PF.bg,
                color: PF.ink,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {branchOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {SUGGESTIONS.map((s) => {
            const rendered = renderSuggestion(s.template);
            return (
              <li key={s.template}>
                <button
                  type="button"
                  title={rendered}
                  aria-label={`Ask: ${rendered}`}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    onSubmit(rendered);
                  }}
                  style={{
                    width: '100%',
                    font: '500 11.5px/1.35 var(--font-inter), system-ui, sans-serif',
                    padding: '6px 10px',
                    border: `1px solid ${PF.ruleSoft}`,
                    borderRadius: 4,
                    background: disabled ? PF.bgAlt : PF.bg,
                    color: PF.ink,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.55 : 1,
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    overflowWrap: 'break-word',
                  }}
                >
                  {rendered}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            // Gate 23 — pill-shaped input. 9999px guarantees the radius
            // is half the height regardless of auto-grow up to 6 lines.
            borderRadius: 9999,
            padding: '8px 16px',
            border: `1px solid ${PF.ruleSoft}`,
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
