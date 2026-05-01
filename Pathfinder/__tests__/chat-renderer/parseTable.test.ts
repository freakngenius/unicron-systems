import { describe, it, expect } from 'vitest';
import {
  parseTables,
  segmentMarkdown,
} from '@/components/chat/markdown/parseTable';

const COMPLETE_TABLE = `Some prose first.

| Project | Score | Value |
|---|---|---|
| prj_a | 92 | $4.2M |
| prj_b | 84 | $880K |

After the table.`;

describe('parseTables', () => {
  it('extracts complete tables and ignores prose', () => {
    const tables = parseTables(COMPLETE_TABLE);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(['Project', 'Score', 'Value']);
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].rows[0].cells).toEqual(['prj_a', '92', '$4.2M']);
  });

  it('refuses tables that lack a divider line', () => {
    const md = `| Project | Score |\n| prj_a | 92 |\n`;
    expect(parseTables(md)).toEqual([]);
  });

  it('refuses tables that have no body rows', () => {
    const md = `| Project | Score |\n|---|---|\n\n`;
    expect(parseTables(md)).toEqual([]);
  });

  it('pads short rows to header width', () => {
    const md = `| A | B | C |\n|---|---|---|\n| x | y |\n\n`;
    const tables = parseTables(md);
    expect(tables[0].rows[0].cells).toEqual(['x', 'y', '']);
  });

  it('handles two tables in one message', () => {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |\n\n`;
    expect(parseTables(md)).toHaveLength(2);
  });
});

describe('segmentMarkdown', () => {
  it('splits into ordered prose + table segments', () => {
    const segments = segmentMarkdown(COMPLETE_TABLE);
    expect(segments.map((s) => s.kind)).toEqual(['markdown', 'table', 'markdown']);
  });

  it('returns a single markdown segment when no tables', () => {
    const segments = segmentMarkdown('# Heading\n\nNo tables here.');
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('markdown');
  });
});
