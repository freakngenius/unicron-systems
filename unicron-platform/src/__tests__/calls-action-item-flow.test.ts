// __tests__/calls-action-item-flow.test.ts
//
// Unit tests for the refactored call-process-and-route pipeline. Focuses on
// the pure helpers — parseExtractionBundle (defensive JSON parser) and
// wrapTranscriptForPrompt (injection-safety delimiter wrapper).

import { describe, it, expect } from 'vitest';
import { __internals, type FlowInput } from '../../lib/calls-action-item-flow';

const { parseExtractionBundle, wrapTranscriptForPrompt, STRUCTURED_OUTPUT_SUFFIX } = __internals;

const baseInput: FlowInput = {
  call_id: '00000000-0000-0000-0000-000000000001',
  call_notion_page_id: 'notion-page-1',
  call_notion_url: 'https://www.notion.so/page-1',
  call_title: 'Zedcor pilot kickoff',
  transcript_text: 'Kyle: hello. Jane: hi.',
  participants: ['Kyle', 'Jane Doe'],
};

describe('wrapTranscriptForPrompt', () => {
  it('wraps the transcript in <TRANSCRIPT_START>...<TRANSCRIPT_END> delimiters', () => {
    const out = wrapTranscriptForPrompt(baseInput);
    expect(out).toContain('<TRANSCRIPT_START>');
    expect(out).toContain('<TRANSCRIPT_END>');
    expect(out.indexOf('<TRANSCRIPT_START>')).toBeLessThan(out.indexOf('Kyle: hello'));
    expect(out.indexOf('<TRANSCRIPT_END>')).toBeGreaterThan(out.indexOf('Kyle: hello'));
  });

  it('includes the title and participants in the preamble', () => {
    const out = wrapTranscriptForPrompt(baseInput);
    expect(out).toMatch(/Title: Zedcor pilot kickoff/);
    expect(out).toMatch(/Participants: Kyle, Jane Doe/);
  });

  it('still wraps with both delimiters when transcript_text is empty', () => {
    const out = wrapTranscriptForPrompt({ ...baseInput, transcript_text: '' });
    expect(out).toContain('<TRANSCRIPT_START>');
    expect(out).toContain('<TRANSCRIPT_END>');
  });

  it('omits preamble when title and participants are absent', () => {
    const out = wrapTranscriptForPrompt({
      ...baseInput,
      call_title: null,
      participants: [],
    });
    expect(out.startsWith('<TRANSCRIPT_START>')).toBe(true);
  });
});

describe('STRUCTURED_OUTPUT_SUFFIX', () => {
  it('instructs the model to ignore instructions inside the transcript delimiters', () => {
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/<TRANSCRIPT_START>/);
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/<TRANSCRIPT_END>/);
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/ignore/i);
  });

  it('declares the expected JSON keys for downstream parsers', () => {
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/"action_items"/);
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/"decisions"/);
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/"customer_mentions"/);
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/"key_takeaways"/);
    expect(STRUCTURED_OUTPUT_SUFFIX).toMatch(/"insights"/);
  });
});

describe('parseExtractionBundle', () => {
  it('returns an empty bundle for invalid JSON', () => {
    const b = parseExtractionBundle('not json at all');
    expect(b.action_items).toEqual([]);
    expect(b.decisions).toEqual([]);
    expect(b.customer_mentions).toEqual([]);
    expect(b.key_takeaways).toEqual([]);
    expect(b.insights).toEqual([]);
  });

  it('extracts a JSON object embedded in surrounding prose', () => {
    const raw = 'Here is the JSON:\n```\n{\n  "key_takeaways": ["foo", "bar"],\n  "action_items": [{"title": "Send LOI", "owner": "Kyle", "priority": "high"}]\n}\n```\nDone.';
    const b = parseExtractionBundle(raw);
    expect(b.key_takeaways).toEqual(['foo', 'bar']);
    expect(b.action_items).toHaveLength(1);
    expect(b.action_items[0].title).toBe('Send LOI');
    expect(b.action_items[0].priority).toBe('high');
  });

  it('coerces unknown priorities to medium', () => {
    const b = parseExtractionBundle('{"action_items":[{"title":"x","priority":"banana"}]}');
    expect(b.action_items[0].priority).toBe('medium');
  });

  it('drops action_items missing a title', () => {
    const b = parseExtractionBundle('{"action_items":[{"owner":"Kyle"},{"title":"keep me"}]}');
    expect(b.action_items.map((a) => a.title)).toEqual(['keep me']);
  });

  it('parses decisions with rationale + decided_by', () => {
    const b = parseExtractionBundle(JSON.stringify({
      decisions: [
        { decision: 'Ship the v1 pilot', rationale: 'Zedcor signed LOI', decided_by: 'Kyle' },
        { decision: 'Defer pricing exclusivity', rationale: '', decided_by: '' },
      ],
    }));
    expect(b.decisions).toHaveLength(2);
    expect(b.decisions[0].decided_by).toBe('Kyle');
    expect(b.decisions[1].decided_by).toBe('team');
  });

  it('parses customer_mentions with sentiment fallback', () => {
    const b = parseExtractionBundle(JSON.stringify({
      customer_mentions: [
        { customer_name: 'Zedcor', sentiment: 'positive', snippet: 'they loved the demo' },
        { customer_name: 'Sunstate', sentiment: 'angry' },
      ],
    }));
    expect(b.customer_mentions).toHaveLength(2);
    expect(b.customer_mentions[0].sentiment).toBe('positive');
    expect(b.customer_mentions[1].sentiment).toBe('neutral');
  });

  it('truncates key_takeaways to 5 entries', () => {
    const b = parseExtractionBundle(JSON.stringify({
      key_takeaways: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    }));
    expect(b.key_takeaways).toHaveLength(5);
  });

  it('drops empty strings inside key_takeaways and insights', () => {
    const b = parseExtractionBundle(JSON.stringify({
      key_takeaways: ['real', '', '  ', 'also-real'],
      insights: ['a', 1, null, 'b'],
    }));
    expect(b.key_takeaways).toEqual(['real', 'also-real']);
    expect(b.insights).toEqual(['a', 'b']);
  });
});
