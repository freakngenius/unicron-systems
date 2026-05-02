// @vitest-environment jsdom
import * as React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(cleanup);
import { MarkdownRenderer } from '@/components/chat/markdown';

// Quiets "'React' is declared but never read" without disabling unused-import
// rules globally in tests.
void React;

// Shiki was removed in fix/chat-renderer-strip-shiki — the renderer now
// emits plain `<pre><code>` blocks. Mock retained as a no-op so any
// transitively-loaded highlighter import resolves harmlessly.

const FIXTURE = fs.readFileSync(
  path.resolve(__dirname, 'fixtures/zedcor-leads.md'),
  'utf-8',
);

beforeEach(() => {
  // Stub clipboard for the click-to-copy assertion.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('<MarkdownRenderer /> on zedcor-leads fixture', () => {
  it('renders the leads table as a real <table>', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const wrap = screen.getByTestId('md-table-wrap');
    expect(wrap).toBeInTheDocument();
    const ths = screen.getAllByTestId('md-th');
    expect(ths.map((th) => th.textContent)).toEqual([
      'Project',
      'Title',
      'Score',
      'Value',
      'Stage',
      'Branch',
      'Distance',
    ]);
  });

  it('detects column kinds from headers', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const ths = screen.getAllByTestId('md-th');
    const kinds = ths.map((th) => th.getAttribute('data-kind'));
    expect(kinds).toEqual(['id', 'title', 'score', 'currency', 'stage', 'plain', 'distance']);
  });

  it('renders score pills with the correct tone for each row', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const pills = screen.getAllByTestId('cell-score');
    // 8 rows, scores: 94, 91, 88, 84, 82, 79, 76, 71
    const tones = pills.map((p) => p.getAttribute('data-tone'));
    expect(tones).toEqual(['green', 'green', 'amber', 'amber', 'amber', 'red', 'red', 'red']);
  });

  it('formats currency cells and shows em-dash for empty', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const currencyTds = screen.getAllByTestId('md-td').filter(
      (el) => el.getAttribute('data-kind') === 'currency',
    );
    // Pre-formatted shorthand should pass through.
    expect(currencyTds[0]).toHaveTextContent('$4.2M');
    // Row 7 (index 6) has `—` — rendered as a muted dash, not a CurrencyCell.
    expect(currencyTds[6].textContent).toBe('—');
  });

  it('renders stage badges with stage tones', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const badges = screen.getAllByTestId('cell-stage');
    expect(badges[0]).toHaveAttribute('data-tone', 'progress'); // RFP
    expect(badges[2]).toHaveAttribute('data-tone', 'won'); // AWARDED
  });

  it('renders distance cells with value + dimmed unit', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const cells = screen.getAllByTestId('cell-distance');
    expect(cells[0]).toHaveTextContent('6.2');
    expect(cells[0]).toHaveTextContent('mi');
  });

  it('renders id cells as click-to-copy buttons', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const ids = screen.getAllByTestId('cell-id');
    expect(ids[0].tagName).toBe('BUTTON');
    expect(ids[0]).toHaveTextContent('prj_abc12390a');
  });

  it('makes title cells link to /projects/<id> when an id column exists', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    const titles = screen.getAllByTestId('cell-title');
    expect(titles[0].getAttribute('href')).toBe('/projects/prj_abc12390a');
  });

  it('renders headings, lists, blockquote, and inline code', () => {
    render(<MarkdownRenderer content={FIXTURE} />);
    expect(
      screen.getByRole('heading', { level: 2, name: /top 8 leads/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /why these stand out/i })).toBeInTheDocument();
    expect(screen.getByText(/treasure valley has answered/i)).toBeInTheDocument();
  });
});

describe('<MarkdownRenderer /> streaming behavior', () => {
  it('shows the table-streaming placeholder while the table is in flight', () => {
    const partial = `# Header\n\n| A | B |\n|---|---|\n| 1 | 2`;
    render(<MarkdownRenderer content={partial} streaming />);
    expect(screen.getByTestId('md-streaming-table')).toBeInTheDocument();
    // The partial table itself is NOT in the DOM as a real table.
    expect(screen.queryByTestId('md-table-wrap')).not.toBeInTheDocument();
  });

  it('shows the code-streaming placeholder for an unclosed fence', () => {
    const partial = `Some prose\n\n\`\`\`ts\nconst x = 1`;
    render(<MarkdownRenderer content={partial} streaming />);
    expect(screen.getByTestId('md-streaming-code')).toBeInTheDocument();
  });

  it('never produces a broken intermediate render across the streaming chunk parade', () => {
    const final = `## T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nDone.`;
    // Walk the full string char-by-char, render at each step, assert no
    // raw pipe-line text leaks into the DOM.
    let acc = '';
    for (const ch of final) {
      acc += ch;
      const { unmount } = render(<MarkdownRenderer content={acc} streaming />);
      const root = screen.getByTestId('md-root');
      const text = root.textContent ?? '';
      // If any raw pipe-line is in the DOM, it must be inside our table.
      if (/\|\s*A\s*\|/.test(text) && !screen.queryByTestId('md-table-wrap')) {
        throw new Error(`Broken intermediate at length ${acc.length}: ${text}`);
      }
      unmount();
    }
  });
});
