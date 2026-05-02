'use client';

// ChatInput — textarea + suggested-prompt chips. Enter submits,
// Shift+Enter inserts a newline. Disabled while the panel is streaming
// an assistant response. Suggested chips come from
// lib/chat/context#suggestedPrompts and rotate as the dashboard view
// changes.

import * as React from 'react';
import { suggestedPrompts } from '@/lib/chat/context';
import type { Branch, ChatContextSnapshot } from '@/lib/types';

const PF = {
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
} as const;

// Demo-canned questions surfaced as quick-action buttons. The branch
// token in `template` is replaced by the currently selected demo branch
// (default Nashville). Questions without a branch token render the
// `template` verbatim. Verbatim list comes from TUESDAY DEMO PLAN.md
// item 11; do not edit copy without checking that doc.
const DEMO_QUESTIONS: ReadonlyArray<{
  label: string;
  template: string;
  hasBranch: boolean;
}> = [
  {
    label: 'Top 5 in {branch}',
    template: 'What are my top 5 leads in {branch} this week?',
    hasBranch: true,
  },
  {
    label: 'Match Zedcor customers',
    template: 'Which leads match an existing Zedcor customer relationship?',
    hasBranch: false,
  },
  {
    label: 'Rejected in {branch}',
    template: 'What leads got rejected in {branch} and why?',
    hasBranch: true,
  },
  {
    label: 'Avg value, score 90+ in {branch}',
    template:
      "What's the average project value of leads above score 90 in {branch}?",
    hasBranch: true,
  },
  {
    label: 'National account involved',
    template: 'Show me leads where a national account is involved.',
    hasBranch: false,
  },
];

const DEFAULT_DEMO_BRANCH = 'Nashville';

export interface ChatInputProps {
  disabled: boolean;
  snapshot: ChatContextSnapshot;
  onSubmit: (message: string) => void;
  branches?: Pick<Branch, 'id' | 'name' | 'code'>[];
}

export function ChatInput({ disabled, snapshot, onSubmit, branches }: ChatInputProps) {
  const [value, setValue] = React.useState('');
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const chips = React.useMemo(() => suggestedPrompts(snapshot), [snapshot]);

  // Default the demo-question branch token to the currently selected
  // branch (if any, and if it's a known branch name) — otherwise fall
  // back to Nashville per the demo script.
  const selectedBranchName = React.useMemo(() => {
    if (!snapshot.selectedBranchId || !branches) return null;
    const b = branches.find((x) => x.id === snapshot.selectedBranchId);
    return b?.name ?? null;
  }, [snapshot.selectedBranchId, branches]);

  const [demoBranch, setDemoBranch] = React.useState<string>(
    selectedBranchName ?? DEFAULT_DEMO_BRANCH,
  );

  // Re-sync the demo branch when the dashboard selection changes, but
  // only if the user hasn't manually picked a different branch in the
  // dropdown. Simple approach: always follow the dashboard selection
  // when one exists; users can still override via the dropdown.
  React.useEffect(() => {
    if (selectedBranchName) setDemoBranch(selectedBranchName);
  }, [selectedBranchName]);

  const branchOptions = React.useMemo(() => {
    const fromProps = (branches ?? [])
      .map((b) => b.name)
      .filter((n): n is string => Boolean(n));
    // Always include Nashville so the demo defaults work even if the
    // workspace's branch list is loading or empty.
    const set = new Set<string>([DEFAULT_DEMO_BRANCH, ...fromProps]);
    return Array.from(set).sort((a, b) =>
      a === DEFAULT_DEMO_BRANCH ? -1 : b === DEFAULT_DEMO_BRANCH ? 1 : a.localeCompare(b),
    );
  }, [branches]);

  const renderDemoQuestion = React.useCallback(
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
      {/* Demo-canned quick-action questions (TUESDAY DEMO PLAN.md item
          11). Visually distinct row above the suggested-prompt chips so
          the demo presenter can fire any of the 5 vetted questions
          without typing. Click dispatches through the same onSubmit
          path the textarea uses. */}
      <div
        data-testid="chat-demo-questions"
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
            DEMO QUESTIONS
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
              aria-label="Demo question branch"
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {DEMO_QUESTIONS.map((q) => {
            const rendered = renderDemoQuestion(q.template);
            const label = q.hasBranch
              ? q.label.replace(/\{branch\}/g, demoBranch)
              : q.label;
            return (
              <button
                key={q.template}
                type="button"
                title={rendered}
                aria-label={`Ask: ${rendered}`}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onSubmit(rendered);
                }}
                style={{
                  font: '500 10.5px/1.2 var(--font-inter), system-ui, sans-serif',
                  padding: '5px 8px',
                  border: `1px solid ${PF.ruleSoft}`,
                  borderRadius: 3,
                  background: disabled ? PF.bgAlt : PF.bg,
                  color: PF.ink,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.55 : 1,
                  textAlign: 'left',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

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
