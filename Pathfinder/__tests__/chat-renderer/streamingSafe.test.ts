import { describe, it, expect } from 'vitest';
import { makeStreamingSafe } from '@/components/chat/markdown/streamingSafe';

describe('makeStreamingSafe', () => {
  it('passes complete content through unchanged', () => {
    const md = '# Title\n\nA paragraph.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nDone.';
    const r = makeStreamingSafe(md);
    expect(r.trimmed).toBe(false);
    expect(r.safe).toBe(md);
  });

  it('replaces an unclosed code fence with a skeleton', () => {
    const md = '# Heading\n\n```ts\nconst x = 1;\nconst y =';
    const r = makeStreamingSafe(md);
    expect(r.trimmed).toBe(true);
    expect(r.placeholder).toBe('code');
    expect(r.safe).not.toContain('```ts');
    expect(r.safe).toContain('streaming');
  });

  it('replaces an in-flight table (no trailing blank) with a skeleton', () => {
    const md = '# Heading\n\n| A | B |\n|---|---|\n| 1 | 2';
    const r = makeStreamingSafe(md);
    expect(r.trimmed).toBe(true);
    expect(r.placeholder).toBe('table');
    expect(r.safe).not.toContain('| A | B |');
  });

  it('replaces a header-only table (divider not yet streamed)', () => {
    const md = '# Heading\n\n| A | B |';
    const r = makeStreamingSafe(md);
    expect(r.trimmed).toBe(true);
    expect(r.placeholder).toBe('table');
  });

  it('survives the streaming chunk parade without ever emitting a broken intermediate', () => {
    const final = '# T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nDone.';
    let acc = '';
    const intermediates: string[] = [];
    for (const ch of final) {
      acc += ch;
      const r = makeStreamingSafe(acc);
      intermediates.push(r.safe);
    }
    // The render-time invariant we care about: no intermediate output may
    // contain a header pipe-row whose next line is neither a divider, nor
    // another pipe-row, nor empty/EOF (which terminates the table cleanly),
    // unless the placeholder is present. This rejects "header dangling
    // without a divider" — the visually-broken case — while permitting a
    // 1-row table mid-stream where the body row sits at EOF.
    for (const out of intermediates) {
      const lines = out.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const isPipe = /^\s*\|.+\|\s*$/.test(lines[i]);
        const isDivider = /^\s*\|?\s*:?-{3,}/.test(lines[i]);
        if (!isPipe || isDivider) continue;
        // Check whether there's a divider anywhere in the contiguous
        // pipe-row block this line belongs to. If yes, react-markdown will
        // render it as a real table.
        let s = i;
        while (s > 0) {
          const prev = lines[s - 1];
          if (/^\s*\|.+\|\s*$/.test(prev) || /^\s*\|?\s*:?-{3,}/.test(prev)) {
            s -= 1;
          } else break;
        }
        let e = i;
        while (e < lines.length - 1) {
          const next = lines[e + 1];
          if (/^\s*\|.+\|\s*$/.test(next) || /^\s*\|?\s*:?-{3,}/.test(next)) {
            e += 1;
          } else break;
        }
        const blockHasDivider = lines
          .slice(s, e + 1)
          .some((l) => /^\s*\|?\s*:?-{3,}/.test(l));
        const hasPlaceholder = out.includes('streaming');
        expect(blockHasDivider || hasPlaceholder).toBe(true);
      }
    }
    // The terminal state matches the full markdown — no trim.
    expect(intermediates[intermediates.length - 1]).toBe(final);
  });
});
