'use client';

// IntelligenceChat — main right-rail panel for the Intelligence Chat
// feature. 420px wide, full height, slides in/out via translateX.
//
// Responsibilities:
//   1. On mount/open: GET /api/chat?contextKey=…&fallback=recent to
//      hydrate the relevant sub-thread (or surface most-recent fallback).
//   2. On user submit: POST /api/chat and consume the SSE stream,
//      progressively appending the assistant response.
//   3. On action click (from ChatMessage): POST /api/chat/actions and
//      append the response as a new system message in the local list.
//   4. On context change while open: re-fetch the thread for the new
//      contextKey, fade out current messages, fade in the new ones.
//   5. On reset: POST /api/chat/reset to soft-delete server messages,
//      then clear local state so a fresh conversation can begin.
//
// Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 1".
// Plan: docs/PLAN-P0-01-INTELLIGENCE-CHAT.md.

import * as React from 'react';
import {
  buildContextKey,
  buildContextLabel,
} from '@/lib/chat/context';
import type {
  Branch,
  ChatContextSnapshot,
  ChatMessage as ChatMessageRow,
  ChatSourceCitation,
  ChatThread,
  Customer,
  Project,
} from '@/lib/types';
import { ChatContextIndicator } from './ChatContextIndicator';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  warm: '#a3e635',
} as const;

const PANEL_WIDTH = 420;
// basePath-aware API root — production runs under /pathfinder.
const API_ROOT = '/pathfinder/api/chat';

export interface IntelligenceChatProps {
  open: boolean;
  onClose: () => void;
  snapshot: ChatContextSnapshot;
  // Lookups for buildContextLabel — already loaded by the dashboard.
  branches: Pick<Branch, 'id' | 'name' | 'code'>[];
  projects: Pick<Project, 'id' | 'title'>[];
  // For future use; included so the warm-customer hook can render in the
  // indicator. Currently not consumed beyond keeping the prop typed.
  customers?: Pick<Customer, 'id' | 'name'>[];
}

export function IntelligenceChat({
  open,
  onClose,
  snapshot,
  branches,
  projects,
}: IntelligenceChatProps) {
  const contextKey = React.useMemo(() => buildContextKey(snapshot), [snapshot]);
  const contextLabel = React.useMemo(
    () => buildContextLabel(snapshot, { projects, branches }),
    [snapshot, projects, branches],
  );

  const [thread, setThread] = React.useState<ChatThread | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageRow[]>([]);
  const [resumed, setResumed] = React.useState<{ contextKey: string; contextLabel: string } | null>(
    null,
  );
  const [streaming, setStreaming] = React.useState(false);
  const [latencyHint, setLatencyHint] = React.useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Keyboard: Escape closes the reset modal if open, otherwise closes the panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showResetConfirm) {
          setShowResetConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, showResetConfirm]);

  // Hydrate thread when context changes (and on open).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${API_ROOT}?contextKey=${encodeURIComponent(contextKey)}&fallback=recent`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          thread: ChatThread | null;
          messages: ChatMessageRow[];
          resumed: { fromContextKey: string; fromContextLabel: string } | null;
        };
        if (cancelled) return;
        setThread(json.thread);
        setMessages(json.messages ?? []);
        setResumed(
          json.resumed
            ? { contextKey: json.resumed.fromContextKey, contextLabel: json.resumed.fromContextLabel }
            : null,
        );
      } catch {
        // Network error — leave the panel in its current state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contextKey]);

  // Auto-scroll to bottom whenever messages change.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Helpers used by sendMessage / dispatchAction below. Hoisted above
  // their consumers so the useCallback deps arrays stay correct without
  // forward-reference gymnastics.
  const appendError = React.useCallback(
    (text: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: -Date.now() - 9,
          thread_id: thread?.id ?? '',
          role: 'assistant',
          kind: 'error',
          content: text,
          payload: {},
          model_used: null,
          latency_ms: null,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [thread],
  );

  const appendActionResult = React.useCallback(
    (text: string, deferred: boolean, blocking?: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: -Date.now() - 99,
          thread_id: thread?.id ?? '',
          role: 'system',
          kind: 'action_result',
          content: text,
          payload: deferred
            ? { status: 'deferred', blocking_branch: blocking ?? 'unknown' }
            : { status: 'wired' },
          model_used: null,
          latency_ms: null,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [thread],
  );

  // Soft-delete server messages then clear local state.
  const handleReset = React.useCallback(async () => {
    setShowResetConfirm(false);
    if (thread) {
      try {
        await fetch(`${API_ROOT}/reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId: thread.id }),
        });
      } catch {
        // Best-effort — local state clears regardless.
      }
    }
    setMessages([]);
    setResumed(null);
    setLatencyHint(null);
  }, [thread]);

  // Send a user turn; consume the SSE stream.
  const sendMessage = React.useCallback(
    async (text: string) => {
      const startedAt = Date.now();
      setStreaming(true);
      const optimisticUser: ChatMessageRow = {
        id: -Date.now(),
        thread_id: thread?.id ?? '',
        role: 'user',
        kind: 'text',
        content: text,
        payload: {},
        model_used: null,
        latency_ms: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        const res = await fetch(API_ROOT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            contextKey,
            contextLabel,
            contextSnapshot: snapshot,
            message: text,
          }),
        });
        if (!res.ok || !res.body) {
          appendError('Chat request failed.');
          return;
        }

        // Spawn an in-flight assistant placeholder.
        let assistantId = -Date.now() - 1;
        let assistantText = '';
        let assistantSources: ChatSourceCitation[] = [];
        let assistantTables: string[] = [];
        let assistantKind: ChatMessageRow['kind'] = 'text';
        let assistantPayload: Record<string, unknown> = {};
        let inflightThreadId = thread?.id ?? '';

        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            thread_id: inflightThreadId,
            role: 'assistant',
            kind: 'text',
            content: '',
            payload: {},
            model_used: null,
            latency_ms: null,
            created_at: new Date().toISOString(),
          },
        ]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const updateAssistant = (patch: Partial<ChatMessageRow>) => {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantId);
            if (idx < 0) return prev;
            const copy = prev.slice();
            copy[idx] = { ...copy[idx], ...patch };
            return copy;
          });
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const block of events) {
            const line = block.trim();
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(json);
            } catch {
              continue;
            }
            const t = evt.type as string;
            if (t === 'meta') {
              inflightThreadId = (evt.threadId as string) ?? inflightThreadId;
              if (!thread) {
                setThread((prev) => prev ?? ({ id: inflightThreadId } as ChatThread));
              }
              if (evt.kind === 'outreach_draft') assistantKind = 'outreach_draft';
              if (evt.kind === 'sonar_unconfigured') {
                assistantPayload = { degraded: true, reason: 'sonar_not_configured' };
              }
              updateAssistant({ thread_id: inflightThreadId, kind: assistantKind, payload: assistantPayload });
            } else if (t === 'delta') {
              const txt = String(evt.text ?? '');
              assistantText += txt;
              updateAssistant({ content: assistantText });
            } else if (t === 'sources') {
              const items = (evt.items as ChatSourceCitation[]) ?? [];
              const tables = (evt.tables as string[] | undefined) ?? [];
              assistantSources = items;
              assistantTables = tables;
              updateAssistant({
                payload: {
                  ...assistantPayload,
                  sources: assistantSources,
                  tables: assistantTables,
                },
              });
            } else if (t === 'outreach') {
              const bundle = evt.bundle;
              assistantKind = 'outreach_draft';
              assistantPayload = { ...assistantPayload, bundle };
              updateAssistant({ kind: 'outreach_draft', payload: assistantPayload });
            } else if (t === 'actions') {
              const items = evt.items;
              assistantPayload = { ...assistantPayload, actions: items };
              updateAssistant({ payload: assistantPayload });
            } else if (t === 'done') {
              const lat = (evt.latencyMs as number) ?? Date.now() - startedAt;
              setLatencyHint(lat);
            } else if (t === 'error') {
              appendError(String(evt.message ?? 'Unknown error.'));
            }
          }
        }
      } catch (err) {
        appendError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setStreaming(false);
      }
    },
    [contextKey, contextLabel, snapshot, thread, appendError],
  );

  const dispatchAction = React.useCallback(
    async (action: string, params: Record<string, unknown>) => {
      if (!thread) return;
      try {
        const res = await fetch(`${API_ROOT}/actions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId: thread.id, action, params }),
        });

        // export_csv returns text/csv directly; trigger a browser download.
        const ct = res.headers.get('content-type') ?? '';
        if (ct.startsWith('text/csv')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `pathfinder-export-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          appendActionResult('CSV exported.', false);
          return;
        }

        const json = (await res.json()) as {
          ok: boolean;
          replyForUser?: string;
          markdown?: string;
          status?: string;
          blocking_branch?: string;
        };
        const reply = json.markdown ?? json.replyForUser ?? '';
        const deferred = json.status === 'deferred' || res.status === 501;
        appendActionResult(
          reply || (deferred ? 'Queued.' : 'Done.'),
          deferred,
          json.blocking_branch,
        );
      } catch (err) {
        appendError(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [thread, appendError, appendActionResult],
  );

  return (
    <div
      role="dialog"
      aria-label="Intelligence Chat"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: PANEL_WIDTH,
        background: PF.bg,
        borderLeft: `1px solid ${PF.ruleSoft}`,
        boxShadow: '-12px 0 32px rgba(10,10,10,0.08)',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH + 24}px)`,
        transition: 'transform 220ms ease-out',
        zIndex: 80,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <Header
        onClose={onClose}
        onReset={() => setShowResetConfirm(true)}
        latencyHint={latencyHint}
        streaming={streaming}
        hasMessages={messages.length > 0}
      />
      <ChatContextIndicator label={contextLabel} resumedFrom={resumed} />

      <div
        ref={scrollRef}
        className="pf-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          background: PF.bgAlt,
        }}
      >
        {messages.length === 0 && !streaming && <EmptyState />}
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            threadId={thread?.id ?? ''}
            onAction={dispatchAction}
          />
        ))}
        {streaming && (
          <div
            className="pf-meta"
            style={{ padding: '6px 14px', color: PF.inkDim, fontSize: 10 }}
          >
            Working…
          </div>
        )}
      </div>

      <ChatInput
        disabled={streaming}
        snapshot={snapshot}
        onSubmit={sendMessage}
        branches={branches}
      />

      {showResetConfirm && (
        <ResetConfirmModal
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
}

function Header({
  onClose,
  onReset,
  latencyHint,
  streaming,
  hasMessages,
}: {
  onClose: () => void;
  onReset: () => void;
  latencyHint: number | null;
  streaming: boolean;
  hasMessages: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderBottom: `1px solid ${PF.ruleSoft}`,
        background: PF.bg,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: streaming ? PF.warm : PF.ink,
          opacity: streaming ? 1 : 0.4,
          transition: 'opacity 200ms',
        }}
      />
      <div className="pf-h2" style={{ flex: 1 }}>Intelligence Chat</div>
      {latencyHint !== null && !streaming && (
        <span className="pf-meta" style={{ color: PF.inkDim, fontSize: 10 }}>
          {latencyHint < 1000 ? `${latencyHint}ms` : `${(latencyHint / 1000).toFixed(1)}s`}
        </span>
      )}
      {hasMessages && !streaming && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset conversation"
          className="pf-pill"
          style={{ padding: '4px 7px', fontSize: 10, color: PF.inkDim }}
        >
          Reset
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close chat"
        className="pf-pill"
        style={{ padding: '4px 7px' }}
      >
        ✕
      </button>
    </div>
  );
}

function ResetConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clear conversation"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(10,10,10,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 90,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: PF.bg,
          borderRadius: 10,
          padding: '22px 20px 18px',
          width: 300,
          boxShadow: '0 8px 32px rgba(10,10,10,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          className="pf-h2"
          style={{ fontSize: 14, fontWeight: 600, color: PF.ink }}
        >
          Clear conversation?
        </div>
        <p
          className="pf-meta"
          style={{ color: PF.inkDim, fontSize: 12, lineHeight: 1.5, margin: 0 }}
        >
          Your chat history with this session will be removed. Map view, filters, and lead data stay unchanged.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            className="pf-pill"
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pf-pill"
            style={{
              padding: '5px 12px',
              fontSize: 12,
              background: PF.ink,
              color: PF.bg,
              border: 'none',
            }}
          >
            Clear chat
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '24px 18px',
        color: PF.inkDim,
        font: '400 12px var(--font-inter), system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      Ask Pathfinder anything about your pipeline. I can answer from the dashboard, draft outreach, summarize a week, or kick off an action. Try one of the chips below.
    </div>
  );
}
