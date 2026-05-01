// Streaming-safety guard for partial markdown.
//
// react-markdown will happily render a half-streamed table as an unstyled
// pile of pipes the moment the second pipe-line arrives but the third row
// is still en-route. Same for unclosed code fences (```ts on its own line
// would absorb the rest of the document into a single inline code block
// until the closing fence streams in).
//
// This helper accepts the running cumulative markdown string and returns
// a "safe" version: the trailing partial table or unclosed code fence is
// trimmed off and replaced with a single-line skeleton placeholder. The
// renderer pairs that placeholder with a CSS pulse so the user sees
// "table loading…" instead of broken output.

// Closed pipe row: `| 1 | 2 |`
const TABLE_HEADER_RE = /^\s*\|.+\|\s*$/;
// In-flight row: `| 1 | 2` (no trailing pipe yet). At least one inner pipe
// to disambiguate from prose that happens to start with a single pipe.
const TABLE_PARTIAL_RE = /^\s*\|[^|\n]*\|.*$/;
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-{3,}.*$/;
const FENCE_RE = /^```/;

function isPipeRow(line: string): boolean {
  return TABLE_HEADER_RE.test(line) || TABLE_PARTIAL_RE.test(line);
}

export type SafeMarkdownResult = {
  safe: string;
  /** True when the input had a partial table or open fence we trimmed. */
  trimmed: boolean;
  /** A short label for the placeholder row, when trimmed=true. */
  placeholder: 'table' | 'code' | null;
};

export function makeStreamingSafe(input: string): SafeMarkdownResult {
  if (!input) return { safe: '', trimmed: false, placeholder: null };

  // 1. Open code fence — count fences. An odd number means an open fence.
  const fenceCount = (input.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 === 1) {
    const lastFence = input.lastIndexOf('\n```');
    const cut = lastFence < 0 ? input.indexOf('```') : lastFence + 1;
    const head = input.slice(0, cut).trimEnd();
    return {
      safe: `${head}\n\n_…streaming code block…_`,
      trimmed: true,
      placeholder: 'code',
    };
  }

  // 2. Partial table — a pipe header + divider with no closing blank line.
  //    Detect by walking lines from the end. If the last non-empty line is
  //    a pipe row, look upward for a divider; if found and the block isn't
  //    followed by a blank line, treat the whole block as in-flight.
  const lines = input.split('\n');
  let lastNonEmpty = lines.length - 1;
  while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') lastNonEmpty -= 1;
  if (lastNonEmpty < 0) return { safe: input, trimmed: false, placeholder: null };

  // Walk back from the last non-empty line to find the start of the
  // current trailing block (delimited by the previous blank line). If any
  // line in that block looks like a pipe row or divider — even a stray
  // single-pipe partial like `|` or `| A ` — assume the table is still
  // streaming and trim the whole block.
  let blockStart = lastNonEmpty;
  while (blockStart > 0 && lines[blockStart - 1].trim() !== '') blockStart -= 1;

  const block = lines.slice(blockStart, lastNonEmpty + 1);
  const sawAnyPipe = block.some(
    (l) => /^\s*\|/.test(l) || TABLE_DIVIDER_RE.test(l),
  );
  const sawCompleteRow = block.some((l) => TABLE_HEADER_RE.test(l));
  const sawDivider = block.some((l) => TABLE_DIVIDER_RE.test(l));

  if (sawAnyPipe) {
    // The block has at least one pipe-shaped line. Per the user-facing
    // contract ("tables don't half-render mid-stream"), we keep the table
    // entirely off-screen until either:
    //   1. the table is followed by a blank line (handled at the top of
    //      this function — no trim needed there), OR
    //   2. the LAST line of the block is itself a closed pipe row, AND
    //      the block has a header + divider above it.
    // Anything else — open partial row at the tail, header without
    // divider, divider on its own — is in-flight.
    const tailLine = block[block.length - 1];
    const tailIsClosedRow = TABLE_HEADER_RE.test(tailLine);
    const tailIsDivider = TABLE_DIVIDER_RE.test(tailLine);
    const completeEnough =
      sawCompleteRow && sawDivider && tailIsClosedRow && !tailIsDivider;
    if (!completeEnough) {
      const head = lines.slice(0, blockStart).join('\n').trimEnd();
      return {
        safe: `${head}\n\n_…streaming table…_`,
        trimmed: true,
        placeholder: 'table',
      };
    }
  }

  return { safe: input, trimmed: false, placeholder: null };
}

// Exports kept for the test surface.
export const __internals = { TABLE_HEADER_RE, TABLE_DIVIDER_RE, FENCE_RE };
