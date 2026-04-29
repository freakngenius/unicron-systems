'use client';

// MarkdownBody — renders an assistant chat response as proper markdown
// (bold, italic, lists, tables, inline code, links) instead of the
// `whiteSpace: 'pre-wrap'` plain-text dump that was leaking literal `**`,
// pipe-tables, and trailing footers into the panel UI.
//
// Component overrides keep the rendering inside the existing pf-* visual
// system: small headers, tabular tables, monospace inline code, tight
// list spacing, opt-out links. No global CSS — every override is scoped
// inline so other consumers of react-markdown elsewhere in the app are
// unaffected.
//
// Special handling: when an inline `code` element looks like a Pathfinder
// project ID (matches `/^(sam\.gov|usaspending|news|harris):/`), it
// renders as a button that fires the optional `onProjectClick` callback
// — the chat message dispatches to the host so clicking opens the
// project modal underneath the panel.

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PF = {
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.10)',
} as const;

const PROJECT_ID_RE = /^(?:sam\.gov|usaspending|news|harris):[A-Za-z0-9._:-]+$/;

export interface MarkdownBodyProps {
  /** Raw markdown text. */
  text: string;
  /** Optional click handler for inline-code project-id refs. */
  onProjectClick?: (projectId: string) => void;
}

export function MarkdownBody({ text, onProjectClick }: MarkdownBodyProps) {
  const components = React.useMemo<Components>(
    () => ({
      // Paragraphs — no top margin on the first paragraph so the body
      // sits flush with the role label above.
      p: ({ children }) => (
        <p
          style={{
            margin: '0 0 8px',
            font: '400 13px/1.5 var(--font-inter), system-ui, sans-serif',
            color: PF.ink,
          }}
        >
          {children}
        </p>
      ),

      // Headers — chat doesn't need h1/h2 sizing; collapse all levels to
      // a small uppercase mono label that matches `pf-label`.
      h1: ({ children }) => <ChatHeader>{children}</ChatHeader>,
      h2: ({ children }) => <ChatHeader>{children}</ChatHeader>,
      h3: ({ children }) => <ChatHeader>{children}</ChatHeader>,
      h4: ({ children }) => <ChatHeader>{children}</ChatHeader>,
      h5: ({ children }) => <ChatHeader>{children}</ChatHeader>,
      h6: ({ children }) => <ChatHeader>{children}</ChatHeader>,

      // Strong / emphasis — keep bold readable; muted italic.
      strong: ({ children }) => (
        <strong style={{ fontWeight: 600, color: PF.ink }}>{children}</strong>
      ),
      em: ({ children }) => (
        <em style={{ fontStyle: 'italic', color: PF.inkSub }}>{children}</em>
      ),

      // Lists — tighter than browser defaults, indented just enough.
      ul: ({ children }) => (
        <ul style={{ margin: '4px 0 8px', paddingLeft: 18, color: PF.ink }}>{children}</ul>
      ),
      ol: ({ children }) => (
        <ol style={{ margin: '4px 0 8px', paddingLeft: 18, color: PF.ink }}>{children}</ol>
      ),
      li: ({ children }) => (
        <li
          style={{
            margin: '2px 0',
            font: '400 13px/1.5 var(--font-inter), system-ui, sans-serif',
          }}
        >
          {children}
        </li>
      ),

      // Inline code — monospace + light bg. Project-id refs get the
      // clickable variant.
      code: ({ children, className }) => {
        // Block code (triple-backticks) gets className; inline code does not.
        if (className) {
          return (
            <code
              style={{
                display: 'block',
                padding: '8px 10px',
                background: PF.bgAlt,
                border: `1px solid ${PF.ruleSoft}`,
                borderRadius: 4,
                font: '400 11.5px/1.5 var(--font-jetbrains-mono), ui-monospace, monospace',
                color: PF.ink,
                whiteSpace: 'pre-wrap',
                margin: '4px 0 8px',
              }}
            >
              {children}
            </code>
          );
        }
        const text = React.Children.toArray(children).join('');
        const isProjectId = typeof text === 'string' && PROJECT_ID_RE.test(text);
        if (isProjectId && onProjectClick) {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onProjectClick(text);
              }}
              title={`Open project ${text}`}
              style={{
                display: 'inline',
                padding: '1px 5px',
                background: PF.hiSoft,
                border: `1px solid ${PF.hi}`,
                borderRadius: 3,
                font: '500 11px/1 var(--font-jetbrains-mono), ui-monospace, monospace',
                color: PF.ink,
                cursor: 'pointer',
                verticalAlign: 'baseline',
              }}
            >
              {text}
            </button>
          );
        }
        return (
          <code
            style={{
              padding: '1px 5px',
              background: PF.bgAlt,
              border: `1px solid ${PF.ruleSoft}`,
              borderRadius: 3,
              font: '500 11.5px/1 var(--font-jetbrains-mono), ui-monospace, monospace',
              color: PF.ink,
            }}
          >
            {children}
          </code>
        );
      },

      // Tables — proper HTML table with thin borders + zebra rows.
      // Tabular-nums on the body so numeric columns line up.
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '4px 0 10px' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              font: '400 12px/1.4 var(--font-inter), system-ui, sans-serif',
              color: PF.ink,
            }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead
          style={{
            background: PF.bgAlt,
            borderBottom: `1px solid ${PF.ruleSoft}`,
          }}
        >
          {children}
        </thead>
      ),
      tr: ({ children }) => (
        <tr style={{ borderBottom: `1px solid ${PF.ruleSoft}` }}>{children}</tr>
      ),
      th: ({ children }) => (
        <th
          style={{
            padding: '5px 8px',
            textAlign: 'left',
            font: '500 10px/1.3 var(--font-jetbrains-mono), ui-monospace, monospace',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: PF.inkDim,
          }}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td
          style={{
            padding: '5px 8px',
            verticalAlign: 'top',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {children}
        </td>
      ),

      // Links — open in new tab, subtle treatment.
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: PF.inkSub,
            textDecoration: 'underline',
            textDecorationColor: PF.ruleSoft,
            textUnderlineOffset: 2,
          }}
        >
          {children}
        </a>
      ),

      // Horizontal rule — make it almost invisible (markdown `---` is
      // common as a section separator but visually noisy in chat).
      hr: () => (
        <hr
          style={{
            border: 'none',
            borderTop: `1px solid ${PF.ruleSoft}`,
            margin: '10px 0',
          }}
        />
      ),

      // Blockquote — left-rule, muted text.
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '4px 0 8px',
            paddingLeft: 10,
            borderLeft: `2px solid ${PF.ruleSoft}`,
            color: PF.inkSub,
          }}
        >
          {children}
        </blockquote>
      ),
    }),
    [onProjectClick],
  );

  return (
    <div
      style={{
        wordBreak: 'break-word',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ── Header (every level collapsed to one style) ──────────────────────────

function ChatHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: '8px 0 4px',
        font: '600 11px/1.3 var(--font-jetbrains-mono), ui-monospace, monospace',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: PF.inkDim,
      }}
    >
      {children}
    </div>
  );
}
