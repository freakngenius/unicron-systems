// lib/chat/footer.ts — provenance-footer helpers for the chat route.
//
// Sonar is instructed to end every response with `TABLES: name1, name2`
// on its own line. In practice it sometimes formats that as a markdown
// header (`## TABLES`, `**TABLES**`, `TABLES` followed by a `---`
// horizontal rule), so the parser and the streaming-strip helper both
// have to be tolerant.
//
// Extracted from app/api/chat/route.ts so the regexes can be unit-tested
// without spinning up the full route.

// ── Public API ─────────────────────────────────────────────────────────

export function parseTablesFooter(text: string): string[] {
  const m = TABLES_FOOTER_RE.exec(text);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) =>
      s
        .trim()
        // Strip any leading bold/italic/code markers that bled into the
        // capture (e.g. when Sonar emits `**TABLES:** projects`).
        .replace(/^[`*_]+|[`*_]+$/g, '')
        .replace(/^pathfinder\./, '')
        // Re-trim in case the marker-strip exposed a leading space.
        .trim(),
    )
    .filter((s) => s.length > 0 && s.toLowerCase() !== '(none)');
}

export function stripTrailingTablesLine(text: string): string {
  return text
    .replace(/\n*(?:[-*_]{3,}\s*\n)?[\s#*_]*TABLES[\s#*_]*[:\s]*\n?[^\n]*\s*$/i, '')
    .trimEnd();
}

// During streaming we suppress everything from the moment the footer
// shape begins. We watch for the literal "TABLES" near end-of-text and
// walk backward to also clip a leading "---" horizontal rule and any
// markdown header padding right before it.
export function stripStreamingFooter(delta: string, accumulated: string): string {
  const lowered = accumulated.toLowerCase();
  const tablesIdx = lowered.lastIndexOf('tables');
  if (tablesIdx < 0) return delta;

  let footerStart = tablesIdx;
  while (footerStart > 0) {
    const ch = accumulated[footerStart - 1];
    if (ch === '#' || ch === '*' || ch === '_' || ch === ' ' || ch === '\t' || ch === '\n') {
      footerStart -= 1;
    } else {
      break;
    }
  }
  // Pull a preceding `---` / `***` / `___` horizontal rule into the
  // footer so it disappears from the visible stream.
  const hrMatch = accumulated.slice(0, footerStart).match(/(?:^|\n)\s*(?:[-*_]){3,}\s*\n?$/);
  if (hrMatch) {
    footerStart -= hrMatch[0].length;
    if (accumulated[footerStart] === '\n') footerStart += 1;
  }

  if (footerStart >= accumulated.length - delta.length) {
    const deltaStart = accumulated.length - delta.length;
    const keep = footerStart - deltaStart;
    return keep > 0 ? delta.slice(0, keep) : '';
  }
  return '';
}

// ── Internal ───────────────────────────────────────────────────────────

// Captures the table-list portion in group 1. Anchored at end-of-string
// so we only match the terminal block.
const TABLES_FOOTER_RE =
  /\n*(?:[-*_]{3,}\s*\n)?[\s#*_]*TABLES[\s#*_]*[:\s]*\n?([^\n]*?)\s*$/i;
