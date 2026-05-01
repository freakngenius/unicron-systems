// GFM table parser — pulls structured rows out of pipe-table markdown so
// the renderer can hand a fully-typed table to React. Pre-parsing avoids a
// pile of context-shenanigans inside react-markdown's per-cell overrides.

export type ParsedTableRow = {
  cells: string[];
};

export type ParsedTable = {
  /** Source line index where the header appears. */
  start: number;
  /** Source line index of the row immediately after the table block. */
  end: number;
  headers: string[];
  rows: ParsedTableRow[];
};

const HEADER_RE = /^\s*\|.+\|\s*$/;
const DIVIDER_RE = /^\s*\|?\s*:?-{3,}.*$/;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((s) => s.trim());
}

/**
 * Find every complete GFM table in `markdown`. A complete table requires:
 *   1. A pipe-row header
 *   2. A pipe-row divider on the next line
 *   3. Zero or more pipe-row body rows
 *   4. A blank line (or EOF)
 *
 * The `endIsBlankLine` requirement is what makes this safe for streaming —
 * a half-streamed table whose final row is still arriving has no trailing
 * blank line yet, so the parser leaves it for the streaming-safe guard.
 */
export function parseTables(markdown: string): ParsedTable[] {
  const lines = markdown.split('\n');
  const tables: ParsedTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (
      HEADER_RE.test(lines[i]) &&
      i + 1 < lines.length &&
      DIVIDER_RE.test(lines[i + 1])
    ) {
      const start = i;
      const headers = splitRow(lines[i]);
      const expectedColumns = headers.length;
      i += 2;
      const rows: ParsedTableRow[] = [];
      while (i < lines.length && HEADER_RE.test(lines[i])) {
        const cells = splitRow(lines[i]);
        // Pad / truncate to header width — agents occasionally drop a
        // trailing pipe and produce one short cell on a row.
        if (cells.length < expectedColumns) {
          while (cells.length < expectedColumns) cells.push('');
        } else if (cells.length > expectedColumns) {
          cells.length = expectedColumns;
        }
        rows.push({ cells });
        i += 1;
      }
      // Require a blank line OR EOF immediately after to consider the table
      // complete. Otherwise hand the block back to the caller as raw text
      // (the streaming-safe guard handles in-flight tables).
      const completed = i >= lines.length || lines[i].trim() === '';
      if (completed && rows.length > 0) {
        tables.push({ start, end: i, headers, rows });
      }
      // Skip the trailing blank if any.
      if (i < lines.length && lines[i].trim() === '') i += 1;
      continue;
    }
    i += 1;
  }
  return tables;
}

/**
 * Splits the markdown into an ordered list of segments — either raw
 * markdown (to be rendered by react-markdown) or a structured table.
 */
export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'table'; table: ParsedTable };

export function segmentMarkdown(markdown: string): Segment[] {
  const tables = parseTables(markdown);
  if (tables.length === 0) return [{ kind: 'markdown', text: markdown }];
  const lines = markdown.split('\n');
  const segments: Segment[] = [];
  let cursor = 0;
  for (const t of tables) {
    if (t.start > cursor) {
      const text = lines.slice(cursor, t.start).join('\n').trim();
      if (text) segments.push({ kind: 'markdown', text });
    }
    segments.push({ kind: 'table', table: t });
    cursor = t.end;
  }
  if (cursor < lines.length) {
    const text = lines.slice(cursor).join('\n').trim();
    if (text) segments.push({ kind: 'markdown', text });
  }
  return segments;
}
