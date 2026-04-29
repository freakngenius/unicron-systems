'use client';

// ChatMessage — renders a single message by `kind`:
//   - text:           role-tagged bubble; provenance footer when payload
//                     carries `sources` or `tables`
//   - outreach_draft: 3 sub-cards (Email / LinkedIn / Voicemail), each
//                     with copy + save + regenerate buttons
//   - action_result:  compact pill with reply text and queued-status
//                     callout when payload.status === 'deferred'
//   - error:          muted red border bubble

import * as React from 'react';
import type { ChatMessage as ChatMessageRow, ChatSourceCitation } from '@/lib/types';

const PF = {
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.12)',
  warm: '#a3e635',
  warmSoft: 'rgba(163,230,53,0.14)',
  err: '#dc2626',
  errSoft: 'rgba(220,38,38,0.08)',
} as const;

interface OutreachBundleShape {
  email: { subject: string; body: string; wordCount: number; charCount: number };
  linkedin: { body: string; charCount: number };
  voicemail: { body: string; wordCount: number };
  verifierWarnings: string[];
}

export interface ChatMessageActionContext {
  threadId: string;
  messageId: number;
}

export interface ChatMessageProps {
  message: ChatMessageRow;
  threadId: string;
  onAction: (action: string, params: Record<string, unknown>) => void;
}

export function ChatMessage({ message, threadId, onAction }: ChatMessageProps) {
  if (message.kind === 'outreach_draft' && message.payload?.bundle) {
    return (
      <OutreachBundleCard
        bundle={message.payload.bundle as OutreachBundleShape}
        threadId={threadId}
        messageId={message.id}
        onAction={onAction}
      />
    );
  }
  if (message.kind === 'action_result') {
    return <ActionResult message={message} />;
  }
  if (message.kind === 'error') {
    return <ErrorBubble text={message.content} />;
  }
  return <TextBubble message={message} />;
}

// ── Text bubble ────────────────────────────────────────────────────────────

function TextBubble({ message }: { message: ChatMessageRow }) {
  const isUser = message.role === 'user';
  const sources = (message.payload?.sources as ChatSourceCitation[] | undefined) ?? [];
  const tables = (message.payload?.tables as string[] | undefined) ?? [];
  const degraded = message.payload?.degraded === true;

  return (
    <div
      style={{
        padding: '10px 12px',
        margin: '8px 14px',
        borderRadius: 6,
        background: isUser ? PF.bgAlt : PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
      }}
    >
      <div className="pf-label" style={{ marginBottom: 4, color: PF.inkDim }}>
        {isUser ? 'You' : 'Pathfinder'}
        {degraded && <span style={{ marginLeft: 6, color: PF.warm }}>· degraded</span>}
      </div>
      <div
        className="pf-body"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
      {(sources.length > 0 || tables.length > 0) && (
        <ProvenanceFooter sources={sources} tables={tables} />
      )}
    </div>
  );
}

// ── Outreach bundle card ──────────────────────────────────────────────────

function OutreachBundleCard({
  bundle,
  threadId,
  messageId,
  onAction,
}: {
  bundle: OutreachBundleShape;
  threadId: string;
  messageId: number;
  onAction: (action: string, params: Record<string, unknown>) => void;
}) {
  return (
    <div
      style={{
        margin: '8px 14px',
        padding: 10,
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="pf-label" style={{ color: PF.inkDim }}>Outreach draft · 3 channels</div>

      {bundle.verifierWarnings.length > 0 && (
        <div
          style={{
            padding: '6px 8px',
            background: PF.warmSoft,
            border: `1px solid ${PF.warm}`,
            borderRadius: 4,
            font: '500 11px var(--font-jetbrains-mono), ui-monospace, monospace',
            color: PF.ink,
          }}
        >
          Rules not all met: {bundle.verifierWarnings.join(', ')}. Review before sending.
        </div>
      )}

      <ChannelCard
        label="Email"
        meta={`${bundle.email.wordCount} words · subject ${bundle.email.charCount}/60`}
      >
        <div style={{ font: '600 12px var(--font-inter), system-ui, sans-serif', marginBottom: 4 }}>
          {bundle.email.subject}
        </div>
        <div className="pf-body" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {bundle.email.body}
        </div>
      </ChannelCard>

      <ChannelCard
        label="LinkedIn DM"
        meta={`${bundle.linkedin.charCount}/200 chars`}
      >
        <div className="pf-body" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {bundle.linkedin.body}
        </div>
      </ChannelCard>

      <ChannelCard
        label="Voicemail"
        meta={`${bundle.voicemail.wordCount} words · ~25 sec`}
      >
        <div className="pf-body" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {bundle.voicemail.body}
        </div>
      </ChannelCard>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="pf-pill"
          onClick={() => {
            const text = `Subject: ${bundle.email.subject}\n\n${bundle.email.body}\n\n— LinkedIn —\n${bundle.linkedin.body}\n\n— Voicemail —\n${bundle.voicemail.body}`;
            // Best-effort copy. Falls back silently if the API isn't available.
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              void navigator.clipboard.writeText(text);
            }
            onAction('copy_draft', { messageId });
          }}
        >
          Copy
        </button>
        <button
          type="button"
          className="pf-pill"
          onClick={() => onAction('save_draft', { bundle, messageId })}
        >
          Save draft
        </button>
        <button
          type="button"
          className="pf-pill"
          onClick={() => onAction('regenerate_draft', { messageId })}
        >
          Regenerate
        </button>
      </div>

      {/* threadId is consumed by onAction via the parent's closure; reference
          here keeps the prop typed and silences the unused-var lint. */}
      <span style={{ display: 'none' }} data-thread={threadId} />
    </div>
  );
}

function ChannelCard({
  label,
  meta,
  children,
}: {
  label: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: PF.bgAlt,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span className="pf-label" style={{ color: PF.inkDim }}>{label}</span>
        <span className="pf-meta" style={{ fontSize: 10, color: PF.inkFaint }}>{meta}</span>
      </div>
      {children}
    </div>
  );
}

// ── Action result ──────────────────────────────────────────────────────────

function ActionResult({ message }: { message: ChatMessageRow }) {
  const isDeferred = message.payload?.status === 'deferred';
  const blocking = message.payload?.blocking_branch as string | undefined;
  return (
    <div
      style={{
        margin: '6px 14px',
        padding: '6px 10px',
        background: isDeferred ? PF.warmSoft : PF.bgAlt,
        border: `1px solid ${isDeferred ? PF.warm : PF.ruleSoft}`,
        borderRadius: 4,
        font: '500 11px var(--font-jetbrains-mono), ui-monospace, monospace',
        color: PF.ink,
      }}
    >
      {message.content}
      {isDeferred && blocking && (
        <span style={{ marginLeft: 6, color: PF.inkDim }}>(awaiting {blocking})</span>
      )}
    </div>
  );
}

// ── Error bubble ───────────────────────────────────────────────────────────

function ErrorBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        margin: '8px 14px',
        padding: '8px 10px',
        background: PF.errSoft,
        border: `1px solid ${PF.err}`,
        borderRadius: 4,
        color: PF.err,
        font: '400 12px var(--font-inter), system-ui, sans-serif',
      }}
    >
      {text}
    </div>
  );
}

// ── Provenance footer ──────────────────────────────────────────────────────

function ProvenanceFooter({
  sources,
  tables,
}: {
  sources: ChatSourceCitation[];
  tables: string[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const summary = [
    sources.length > 0 ? `${sources.length} web` : null,
    tables.length > 0 ? `${tables.length} tables` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px dashed ${PF.ruleSoft}`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="pf-meta"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: PF.inkDim,
          cursor: 'pointer',
          fontSize: 10,
        }}
      >
        Sources · {summary} {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div style={{ marginTop: 4, fontSize: 11, color: PF.inkDim }}>
          {sources.length > 0 && (
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              {sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: PF.inkSub, textDecoration: 'underline' }}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {tables.length > 0 && (
            <div style={{ marginTop: 4 }}>
              Tables: {tables.map((t) => `pathfinder.${t}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
