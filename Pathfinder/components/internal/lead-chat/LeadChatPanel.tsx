'use client';

// LeadChatPanel — the slide-in panel for the Internal Lead Chat Agent.
//
// Mirrors components/chat/IntelligenceChat.tsx in shape (420px wide, slides
// from the right, Escape closes) but is Internal-only and ships with its
// own message/input primitives so the existing Pathfinder chat at
// components/chat/* stays untouched. Reuses ChatContextIndicator directly
// for the "Viewing" chip.
//
// Plan: Pathfinder/docs/PLAN-stream-h.md.

import * as React from 'react';
import { ChatContextIndicator } from '@/components/chat/ChatContextIndicator';
import type {
  LeadChatMessageRow,
  LeadChatPostBody,
  LeadChatSseEvent,
} from '@/lib/chat/lead-chat-types';
import type { ChatSourceCitation } from '@/lib/types';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  warm: '#a3e635',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.12)',
} as const;

const PANEL_WIDTH = 420;
const API_ROOT = '/pathfinder/api/internal/chat';

export interface LeadChatPanelProps {
  open: boolean;
  onClose: () => void;
  onMinimize: () => void;
  orgSlug: string;
  orgId: string;
  companyId: string | null;
  companyName: string | null;
  filteredCompanyIds?: string[];
  scopeLabel: string;
}

interface ViewMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: ChatSourceCitation[] | null;
  researching: boolean;
  // Stream H v2: active data-tool chip ("Looking up leads"). Cleared when
  // the model emits its first text delta or when tool_done fires.
  lookingUpLeads: boolean;
  error: boolean;
}

function readOperatorEmail(): string | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem('pf_email');
  return v && v.trim().length > 0 ? v.trim() : null;
}

function chatHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const op = readOperatorEmail();
  return op ? { ...extra, 'x-operator-email': op } : { ...extra };
}

function threadKey(orgSlug: string, companyId: string | null): string {
  return `pf-internal-thread-${orgSlug}-${companyId ?? 'list'}`;
}

function getOrCreateThreadId(orgSlug: string, companyId: string | null): string {
  const key = threadKey(orgSlug, companyId);
  if (typeof window === 'undefined') return `t-${Date.now()}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const fresh = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, fresh);
  return fresh;
}

function rowToViewMessage(row: LeadChatMessageRow): ViewMessage {
  return {
    id: row.id,
    role:
      row.role === 'user' || row.role === 'assistant' || row.role === 'system'
        ? row.role
        : 'assistant',
    content: row.content,
    sources: (row.sources as ChatSourceCitation[] | null) ?? null,
    researching: false,
    lookingUpLeads: false,
    error: row.kind === 'error',
  };
}

export function LeadChatPanel(props: LeadChatPanelProps): React.ReactElement {
  const {
    open,
    onClose,
    onMinimize,
    orgSlug,
    companyId,
    companyName,
    filteredCompanyIds,
    scopeLabel,
  } = props;

  const threadId = React.useMemo(
    () => getOrCreateThreadId(orgSlug, companyId),
    [orgSlug, companyId],
  );
  const [messages, setMessages] = React.useState<ViewMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Hydrate prior messages on open or context change.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = `${API_ROOT}?org_slug=${encodeURIComponent(orgSlug)}&thread_id=${encodeURIComponent(threadId)}${
          companyId ? `&company_id=${encodeURIComponent(companyId)}` : ''
        }`;
        const res = await fetch(url, { credentials: 'include', headers: chatHeaders() });
        if (!res.ok) return;
        const json = (await res.json()) as {
          thread_id: string;
          messages: LeadChatMessageRow[];
        };
        if (cancelled) return;
        setMessages((json.messages ?? []).map(rowToViewMessage));
      } catch {
        // Network error: leave the panel empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgSlug, companyId, threadId]);

  // Auto-scroll on any message change.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const sendMessage = React.useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setStreaming(true);
      const userId = -Date.now();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', content: text, sources: null, researching: false, lookingUpLeads: false, error: false },
      ]);

      const assistantId = -Date.now() - 1;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          sources: null,
          researching: false,
          lookingUpLeads: false,
          error: false,
        },
      ]);

      const body: LeadChatPostBody = {
        org_slug: orgSlug,
        company_id: companyId,
        filtered_company_ids: filteredCompanyIds && !companyId ? filteredCompanyIds : undefined,
        thread_id: threadId,
        message: text,
        scope_label: scopeLabel,
      };

      const updateAssistant = (patch: Partial<ViewMessage>) => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === assistantId);
          if (idx < 0) return prev;
          const copy = prev.slice();
          copy[idx] = { ...copy[idx], ...patch };
          return copy;
        });
      };

      try {
        const res = await fetch(API_ROOT, {
          method: 'POST',
          headers: chatHeaders({ 'content-type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          updateAssistant({ content: 'Chat request failed.', error: true });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let acc = '';

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
            let evt: LeadChatSseEvent;
            try {
              evt = JSON.parse(json) as LeadChatSseEvent;
            } catch {
              continue;
            }
            if (evt.type === 'researching') {
              updateAssistant({ researching: true });
            } else if (evt.type === 'tool_start') {
              if (evt.name === 'pathfinder_leads') {
                updateAssistant({ lookingUpLeads: true });
              } else if (evt.name === 'perplexity_sonar') {
                updateAssistant({ researching: true });
              }
            } else if (evt.type === 'tool_done') {
              if (evt.name === 'pathfinder_leads') {
                updateAssistant({ lookingUpLeads: false });
              } else if (evt.name === 'perplexity_sonar') {
                updateAssistant({ researching: false });
              }
            } else if (evt.type === 'delta') {
              acc += evt.text;
              updateAssistant({ content: acc, researching: false, lookingUpLeads: false });
            } else if (evt.type === 'sources') {
              updateAssistant({ sources: evt.items });
            } else if (evt.type === 'error') {
              updateAssistant({ content: evt.message, error: true });
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateAssistant({ content: `Network error: ${msg}`, error: true });
      } finally {
        setStreaming(false);
      }
    },
    [orgSlug, companyId, filteredCompanyIds, threadId, scopeLabel],
  );

  const onSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (streaming) return;
      const text = draft;
      setDraft('');
      void sendMessage(text);
    },
    [draft, streaming, sendMessage],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (streaming) return;
        const text = draft;
        setDraft('');
        void sendMessage(text);
      }
    },
    [draft, streaming, sendMessage],
  );

  return (
    <div
      role="dialog"
      aria-label="Internal Lead Chat"
      data-testid="lead-chat-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: PANEL_WIDTH,
        background: PF.bg,
        borderLeft: `1px solid ${PF.ruleSoft}`,
        borderTopLeftRadius: 10,
        borderBottomLeftRadius: 10,
        boxShadow: '-12px 0 32px rgba(10,10,10,0.08)',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH + 24}px)`,
        transition: 'transform 220ms ease-out',
        zIndex: 80,
        pointerEvents: open ? 'auto' : 'none',
        overflow: 'hidden',
      }}
    >
      <Header
        streaming={streaming}
        companyName={companyName}
        onClose={onClose}
        onMinimize={onMinimize}
      />
      <ChatContextIndicator label={scopeLabel} />

      <div
        ref={scrollRef}
        className="pf-scrollbar"
        style={{ flex: 1, overflowY: 'auto', background: PF.bgAlt, padding: '12px 14px' }}
      >
        {messages.length === 0 && !streaming && (
          <EmptyState companyName={companyName} />
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
      </div>

      <form onSubmit={onSubmit} style={{ borderTop: `1px solid ${PF.ruleSoft}`, padding: 10 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          placeholder={
            companyName
              ? `Ask about ${companyName}, draft outreach, or run research`
              : 'Ask about these companies, draft outreach, or run research'
          }
          rows={2}
          style={{
            width: '100%',
            font: '400 13px var(--font-inter), system-ui, sans-serif',
            color: PF.ink,
            background: PF.bg,
            border: `1px solid ${PF.ruleSoft}`,
            borderRadius: 8,
            padding: '8px 10px',
            resize: 'none',
            outline: 'none',
          }}
          data-testid="lead-chat-input"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="submit"
            disabled={streaming || draft.trim().length === 0}
            data-testid="lead-chat-send"
            style={{
              font: '500 12px var(--font-inter), system-ui, sans-serif',
              padding: '6px 12px',
              border: 'none',
              borderRadius: 6,
              background: streaming || draft.trim().length === 0 ? PF.inkDim : PF.ink,
              color: PF.bg,
              cursor: streaming || draft.trim().length === 0 ? 'default' : 'pointer',
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function Header(props: {
  streaming: boolean;
  companyName: string | null;
  onClose: () => void;
  onMinimize: () => void;
}): React.ReactElement {
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
          background: props.streaming ? PF.warm : PF.ink,
          opacity: props.streaming ? 1 : 0.4,
          transition: 'opacity 200ms',
        }}
      />
      <div
        className="pf-h2"
        style={{ flex: 1, font: '600 13px var(--font-inter), system-ui, sans-serif', color: PF.ink }}
      >
        Lead Chat{props.companyName ? ` ${'·'} ${props.companyName}` : ''}
      </div>
      <button
        type="button"
        onClick={props.onMinimize}
        aria-label="Minimize chat"
        className="pf-pill"
        style={{ padding: '4px 7px' }}
      >
        {'–'}
      </button>
      <button
        type="button"
        onClick={props.onClose}
        aria-label="Close chat"
        className="pf-pill"
        style={{ padding: '4px 7px' }}
      >
        {'✕'}
      </button>
    </div>
  );
}

function EmptyState({ companyName }: { companyName: string | null }): React.ReactElement {
  return (
    <div
      style={{
        padding: '8px 4px',
        color: PF.inkDim,
        font: '400 12px var(--font-inter), system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      {companyName
        ? `Ask anything about ${companyName}. Try "Why did this company score what it did", "Recent news on the leadership team", or "Draft an opener".`
        : 'Ask anything about the Internal pipeline. Try "Which companies have confirmed federal awards", "Top 5 by score", or "Draft an opener for the top one".'}
    </div>
  );
}

function Bubble({ message }: { message: ViewMessage }): React.ReactElement {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked; ignore.
    }
  }, [message.content]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          font: '500 10px var(--font-inter), system-ui, sans-serif',
          color: PF.inkDim,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {isUser ? 'You' : 'Agent'}
      </div>
      <div
        style={{
          background: isUser ? PF.bg : '#ffffff',
          border: `1px solid ${message.error ? '#dc2626' : PF.ruleSoft}`,
          borderRadius: 8,
          padding: '10px 12px',
          color: PF.ink,
          font: '400 13px var(--font-inter), system-ui, sans-serif',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.lookingUpLeads && (
          <div
            data-testid="lead-chat-looking-up"
            style={{
              display: 'inline-block',
              marginRight: 6,
              marginBottom: 6,
              padding: '2px 8px',
              fontSize: 10,
              color: PF.inkSub,
              background: 'rgba(163,230,53,0.14)',
              border: `1px solid ${PF.warm}`,
              borderRadius: 999,
              letterSpacing: '0.02em',
            }}
          >
            Looking up leads
          </div>
        )}
        {message.researching && (
          <div
            data-testid="lead-chat-researching"
            style={{
              display: 'inline-block',
              marginBottom: 6,
              padding: '2px 8px',
              fontSize: 10,
              color: PF.inkSub,
              background: PF.hiSoft,
              border: `1px solid ${PF.hi}`,
              borderRadius: 999,
              letterSpacing: '0.02em',
            }}
          >
            Researching with Perplexity
          </div>
        )}
        {message.content || (message.researching || message.lookingUpLeads ? '' : isAssistant ? '...' : '')}
      </div>
      {message.sources && message.sources.length > 0 && (
        <div
          style={{
            marginTop: 6,
            font: '400 11px var(--font-inter), system-ui, sans-serif',
            color: PF.inkDim,
          }}
        >
          <div style={{ marginBottom: 2 }}>Sources:</div>
          {message.sources.map((s, i) => (
            <div key={`${s.url}-${i}`}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: PF.inkSub, textDecoration: 'underline' }}
              >
                {s.title || s.url}
              </a>
            </div>
          ))}
        </div>
      )}
      {isAssistant && message.content && (
        <button
          type="button"
          onClick={onCopy}
          data-testid="lead-chat-copy"
          className="pf-pill"
          style={{
            marginTop: 6,
            padding: '3px 8px',
            font: '500 10px var(--font-inter), system-ui, sans-serif',
            color: PF.inkDim,
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  );
}
