'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { CellByKind, ALIGNMENT_BY_KIND } from './cells';
import { CitationChip, type CitationData } from './Citation';
import { detectCellKind, type CellKind } from './cellHeuristics';
import { makeStreamingSafe } from './streamingSafe';
import { segmentMarkdown, type ParsedTable } from './parseTable';
import type { ChatSourceCitation } from '@/lib/types';

// MarkdownRenderer
//
// Renders chat assistant markdown into rich HTML with Pathfinder-styled
// tables, score pills, currency formatting, stage badges, distance cells,
// mono ID cells (click-to-copy), syntax-highlighted code, and citation
// chips. Designed for streaming use — pass `streaming=true` while the
// SSE deltas are still landing so partial tables / open code fences are
// gracefully replaced with skeleton placeholders.
//
// Architecture: a fast pre-pass (parseTable.ts) extracts complete GFM
// tables into a structured form. The render walks segments, handing prose
// to react-markdown and tables to a custom <SmartTable> that knows about
// columns, scores, stages, etc.

export type MarkdownRendererProps = {
  /** The cumulative markdown content of the assistant message. */
  content: string;
  /** True while the SSE stream is still emitting deltas for this message. */
  streaming?: boolean;
  /**
   * Optional citations from the chat route's `sources` SSE event. When
   * provided, inline `[N]` markers in the text become hoverable chips
   * pointing at `sources[N - 1]`.
   */
  sources?: ChatSourceCitation[];
  /**
   * When provided, inline backtick-wrapped tokens that match the
   * Pathfinder lead-ID format become clickable chips that open the lead
   * detail modal for that project.
   */
  onLeadClick?: (projectId: string) => void;
};

// ── Lead-ID detection ────────────────────────────────────────────────────
//
// Matches the two formats Pathfinder's agent outputs:
//   source-prefixed — "harris:HC-METRO-2026-031", "sam.gov:SOLICIT-123"
//   direct uppercase — "TxDOT-I45-2026-001" (≥ 3 hyphenated segments)
// Checked against inline-code content only; fenced blocks are unaffected.

const LEAD_ID_RE =
  /^(?:[a-z][a-z0-9.]*:[A-Za-z0-9][A-Za-z0-9\-_]{4,}|[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+){2,})$/;

// ── LeadIdChip — interactive inline lead-ID token ────────────────────────

function LeadIdChip({ id, onClick }: { id: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open lead: ${id}`}
      className="rounded-sm border border-rule/15 bg-bgAlt px-1 py-[1px] font-mono text-[11.5px] text-ink cursor-pointer hover:bg-hi/10 hover:border-hi/40 transition-colors duration-100"
    >
      {id}
    </button>
  );
}

// ── Inline `[N]` → CitationChip transformer ──────────────────────────────

const CITATION_RE = /\[(\d{1,3})\]/g;

function replaceCitations(node: React.ReactNode, sources: ChatSourceCitation[]): React.ReactNode {
  if (typeof node === 'string') {
    if (!CITATION_RE.test(node)) return node;
    CITATION_RE.lastIndex = 0;
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = CITATION_RE.exec(node)) !== null) {
      const idx = Number(m[1]);
      out.push(node.slice(last, m.index));
      const src = sources[idx - 1];
      const data: CitationData = {
        index: idx,
        title: src?.title,
        url: src?.url,
      };
      out.push(<CitationChip key={`cite-${m.index}-${idx}`} data={data} />);
      last = m.index + m[0].length;
    }
    out.push(node.slice(last));
    return <>{out}</>;
  }
  if (Array.isArray(node)) {
    return node.map((n, i) => (
      <React.Fragment key={i}>{replaceCitations(n, sources)}</React.Fragment>
    ));
  }
  return node;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function nodeToText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } | undefined;
    return nodeToText(props?.children);
  }
  return '';
}

// ── Smart table component ────────────────────────────────────────────────
//
// Receives a fully-parsed table. Computes column kinds once from headers
// (with a sample-cell fallback for ambiguous columns), then renders
// every cell with the matching specialized component. The id column's
// value for each row is captured so the title column can deep-link to
// /projects/<id>.

function SmartTable({
  table,
  sources,
  onLeadClick,
}: {
  table: ParsedTable;
  sources: ChatSourceCitation[];
  onLeadClick?: (id: string) => void;
}) {
  const columns: { header: string; kind: CellKind }[] = React.useMemo(
    () =>
      table.headers.map((header, i) => ({
        header,
        kind: detectCellKind(header, table.rows[0]?.cells[i]),
      })),
    [table.headers, table.rows],
  );

  const idColumnIndex = React.useMemo(
    () => columns.findIndex((c) => c.kind === 'id'),
    [columns],
  );

  return (
    <div
      data-testid="md-table-wrap"
      className="my-4 max-h-[60vh] overflow-auto rounded-md border border-rule/15 bg-bg"
    >
      <table className="w-full border-collapse text-[12.5px] leading-[1.5] text-ink">
        <thead className="sticky top-0 z-[1] bg-bgAlt text-[11px] uppercase tracking-wider text-inkDim">
          <tr>
            {columns.map((col, i) => {
              const align = ALIGNMENT_BY_KIND[col.kind];
              return (
                <th
                  key={i}
                  scope="col"
                  data-testid="md-th"
                  data-kind={col.kind}
                  className={`px-2.5 py-1.5 text-${align} font-semibold border-b border-rule/15`}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule/10">
          {table.rows.map((row, rIdx) => {
            const idHint =
              idColumnIndex >= 0
                ? row.cells[idColumnIndex].replace(/^`|`$/g, '').trim() || undefined
                : undefined;
            return (
              <tr key={rIdx} className="align-middle hover:bg-bgAlt/60">
                {row.cells.map((raw, cIdx) => {
                  const col = columns[cIdx] ?? { header: '', kind: 'plain' as CellKind };
                  const align = ALIGNMENT_BY_KIND[col.kind];
                  // Inline markdown inside cells (bold / links / inline code)
                  // is rendered by feeding the cell text back through
                  // react-markdown for a tiny inline-only pass.
                  return (
                    <td
                      key={cIdx}
                      data-testid="md-td"
                      data-kind={col.kind}
                      className={`px-2.5 py-1.5 text-${align} text-[12.5px] text-ink align-middle`}
                    >
                      <CellByKind
                        kind={col.kind}
                        raw={raw}
                        idHint={col.kind === 'title' ? idHint : undefined}
                      >
                        <InlineMarkdown text={raw} sources={sources} onLeadClick={onLeadClick} />
                      </CellByKind>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Small inline-only markdown pass for cell content. Strips paragraph
// wrappers so the inline elements sit flat inside the <td>.
function InlineMarkdown({
  text,
  sources,
  onLeadClick,
}: {
  text: string;
  sources: ChatSourceCitation[];
  onLeadClick?: (id: string) => void;
}) {
  const components: Components = {
    p: ({ children }) => <>{sources.length > 0 ? replaceCitations(children, sources) : children}</>,
    code: ({ children, ...rest }) => {
      const id = nodeToText(children).trim();
      if (onLeadClick && LEAD_ID_RE.test(id)) {
        return <LeadIdChip id={id} onClick={() => onLeadClick(id)} />;
      }
      return (
        <code
          {...rest}
          className="rounded-sm border border-rule/15 bg-bgAlt px-1 py-[1px] font-mono text-[11px] text-ink"
        >
          {children}
        </code>
      );
    },
    a: ({ children, href, ...rest }) => (
      <a
        {...rest}
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="text-[#0e7490] underline decoration-hi/60 underline-offset-2"
      >
        {children}
      </a>
    ),
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}

// ── Prose component overrides (everything not in a table) ────────────────

function makeProseComponents(sources: ChatSourceCitation[], onLeadClick?: (id: string) => void): Components {
  return {
    h1: ({ children, ...props }) => (
      <h1 {...props} className="mb-2 mt-4 text-[18px] font-semibold leading-[1.3] text-ink first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 {...props} className="mb-1.5 mt-4 text-[15.5px] font-semibold leading-[1.3] text-ink first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 {...props} className="mb-1 mt-3 text-[13.5px] font-semibold leading-[1.3] text-inkSub first:mt-0">
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 {...props} className="mb-1 mt-3 text-[12.5px] font-semibold leading-[1.3] text-inkSub first:mt-0">
        {children}
      </h4>
    ),
    p: ({ children, ...props }) => (
      <p {...props} className="my-2 text-[13px] leading-[1.55] text-ink first:mt-0 last:mb-0">
        {sources.length > 0 ? replaceCitations(children, sources) : children}
      </p>
    ),
    strong: ({ children, ...props }) => (
      <strong {...props} className="font-semibold text-ink">
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em {...props} className="italic text-inkSub">
        {children}
      </em>
    ),
    ul: ({ children, ...props }) => (
      <ul {...props} className="my-2 list-disc pl-5 text-[13px] leading-[1.55] text-ink marker:text-inkFaint">
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol {...props} className="my-2 list-decimal pl-5 text-[13px] leading-[1.55] text-ink marker:text-inkFaint">
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li {...props} className="my-0.5">
        {sources.length > 0 ? replaceCitations(children, sources) : children}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        {...props}
        className="my-3 border-l-2 border-hi/60 bg-hi/5 px-3 py-2 text-[13px] italic text-inkSub"
      >
        {children}
      </blockquote>
    ),
    a: ({ children, href, ...props }) => (
      <a
        {...props}
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="text-[#0e7490] underline decoration-hi/60 underline-offset-2 hover:decoration-hi"
      >
        {children}
      </a>
    ),
    code: ({ className, children, ...props }) => {
      const isFenced = /language-/.test(className ?? '');
      if (!isFenced) {
        const id = nodeToText(children).trim();
        if (onLeadClick && LEAD_ID_RE.test(id)) {
          return <LeadIdChip id={id} onClick={() => onLeadClick(id)} />;
        }
        return (
          <code
            {...props}
            className="rounded-sm border border-rule/15 bg-bgAlt px-1 py-[1px] font-mono text-[11.5px] text-ink"
          >
            {children}
          </code>
        );
      }
      return <code className={className}>{children}</code>;
    },
    pre: ({ children }) => {
      const child = React.Children.only(children) as React.ReactElement;
      const childProps = (child.props ?? {}) as { className?: string; children?: React.ReactNode };
      const lang = (childProps.className?.match(/language-([\w-]+)/)?.[1] ?? '').trim();
      const code = nodeToText(childProps.children).replace(/\n$/, '');
      return <CodeBlock language={lang} code={code} />;
    },
    hr: ({ ...props }) => (
      <hr {...props} className="my-4 border-0 border-t border-rule/15" />
    ),
  };
}

// ── Public component ─────────────────────────────────────────────────────

export function MarkdownRenderer({ content, streaming, sources = [], onLeadClick }: MarkdownRendererProps) {
  const safe = React.useMemo(() => {
    if (!streaming) {
      return { safe: content, trimmed: false, placeholder: null as null | 'table' | 'code' };
    }
    return makeStreamingSafe(content);
  }, [content, streaming]);

  const segments = React.useMemo(() => segmentMarkdown(safe.safe), [safe.safe]);

  const components = React.useMemo(() => makeProseComponents(sources, onLeadClick), [sources, onLeadClick]);

  return (
    <div className="pf-md text-ink" data-testid="md-root">
      {segments.map((seg, i) => {
        if (seg.kind === 'table') {
          return <SmartTable key={i} table={seg.table} sources={sources} onLeadClick={onLeadClick} />;
        }
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
            {seg.text}
          </ReactMarkdown>
        );
      })}
      {safe.trimmed && (
        <div
          className="my-2 inline-flex items-center gap-2 rounded-sm border border-dashed border-rule/20 bg-bgAlt px-2 py-1 text-[11px] text-inkDim"
          data-testid={`md-streaming-${safe.placeholder}`}
        >
          <span className="inline-block h-1.5 w-1.5 animate-pf-pulse rounded-full bg-warm" />
          {safe.placeholder === 'table' ? 'building table' : 'building code block'}…
        </div>
      )}
    </div>
  );
}
