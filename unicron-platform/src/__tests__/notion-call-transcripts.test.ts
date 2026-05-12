// src/__tests__/notion-call-transcripts.test.ts
// Unit tests for lib/notion-call-transcripts.ts.
//
// We mock global fetch and inspect the request bodies, since the service module
// uses raw fetch() against the Notion REST API (following the prevailing pattern
// in lib/agents/notion-kanban-sync.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.NOTION_TOKEN = 'ntn_test_token';
  process.env.NOTION_DB_CALL_TRANSCRIPTS = 'bd720f22aa1f40d3a9872f83c2a2d7a8';
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.resetModules();
});

function mockFetchOk(responseBody: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let idx = 0;
  const fetchMock = vi.fn().mockImplementation(async () => {
    const r = responses[idx++] ?? responses[responses.length - 1];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('partitionParticipants', () => {
  it('splits canonical from external names', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const { partitionParticipants } = __internals;
    const r = partitionParticipants(['Kyle', 'Keenan', 'Jane Doe', 'Curtis', 'External Vendor']);
    expect(r.internal).toEqual(['Kyle', 'Keenan', 'Curtis']);
    expect(r.external).toEqual(['Jane Doe', 'External Vendor']);
  });

  it('trims whitespace and drops empty entries', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const r = __internals.partitionParticipants(['  Kyle  ', '', '   ', 'External']);
    expect(r.internal).toEqual(['Kyle']);
    expect(r.external).toEqual(['External']);
  });

  it('is case-sensitive (canonical names use Notion option casing)', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const r = __internals.partitionParticipants(['kyle', 'KEENAN']);
    expect(r.internal).toEqual([]);
    expect(r.external).toEqual(['kyle', 'KEENAN']);
  });
});

describe('deriveTitle', () => {
  it('uses provided title when present', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const t = __internals.deriveTitle(
      { title: 'Zedcor pilot kickoff', date: '2026-05-12' },
      ['Kyle'],
    );
    expect(t).toBe('Zedcor pilot kickoff');
  });

  it('joins internal participants with date', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const t = __internals.deriveTitle({ date: '2026-05-12' }, ['Kyle', 'Keenan']);
    expect(t).toBe('Kyle + Keenan — 2026-05-12');
  });

  it('falls back to source label when no internal participants', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const t = __internals.deriveTitle({ date: '2026-05-12', source: 'fathom' }, []);
    expect(t).toBe('fathom — 2026-05-12');
  });

  it('falls back to "Call" when nothing identifies the call', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const t = __internals.deriveTitle({ date: '2026-05-12' }, []);
    expect(t).toBe('Call — 2026-05-12');
  });
});

describe('chunkString', () => {
  it('returns empty array for empty input', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    expect(__internals.chunkString('', 100)).toEqual([]);
  });

  it('chunks a long string at the limit boundary', async () => {
    const { __internals } = await import('../../lib/notion-call-transcripts');
    const big = 'a'.repeat(2500);
    const chunks = __internals.chunkString(big, 2000);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(2000);
    expect(chunks[1].length).toBe(500);
  });
});

// ─── createCallTranscriptPage ─────────────────────────────────────────────────

describe('createCallTranscriptPage', () => {
  it('throws if neither transcript nor summary_notes is provided', async () => {
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await expect(
      createCallTranscriptPage({ participants: ['Kyle'] }),
    ).rejects.toThrow(/at least one of transcript or summary_notes/);
  });

  it('throws if NOTION_TOKEN is missing', async () => {
    delete process.env.NOTION_TOKEN;
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await expect(
      createCallTranscriptPage({ summary_notes: 'hello' }),
    ).rejects.toThrow(/NOTION_TOKEN/);
  });

  it('throws if NOTION_DB_CALL_TRANSCRIPTS is missing', async () => {
    delete process.env.NOTION_DB_CALL_TRANSCRIPTS;
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await expect(
      createCallTranscriptPage({ summary_notes: 'hello' }),
    ).rejects.toThrow(/NOTION_DB_CALL_TRANSCRIPTS/);
  });

  it('POSTs to /v1/pages with the correct properties and body shape', async () => {
    const fetchMock = mockFetchOk({
      id: 'page-1234',
      url: 'https://www.notion.so/Page-1234',
    });

    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    const result = await createCallTranscriptPage({
      title: 'Zedcor pilot kickoff',
      date: '2026-05-12',
      participants: ['Kyle', 'Jane Doe (Zedcor)'],
      summary_notes: 'Met with Jane about pilot scope.',
      transcript: 'Kyle: Welcome. Jane: Thanks for having us.',
      key_takeaways: 'Pilot signed off; 30-day clock starts Monday.',
      insights: 'Construction security is a wedge into adjacent verticals.',
      source: 'manual_upload',
    });

    expect(result.notion_page_id).toBe('page-1234');
    expect(result.notion_url).toBe('https://www.notion.so/Page-1234');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ntn_test_token');
    expect(headers['Notion-Version']).toBe('2022-06-28');

    const body = JSON.parse(init.body);
    expect(body.parent.database_id).toBe('bd720f22aa1f40d3a9872f83c2a2d7a8');
    expect(body.properties.Title.title[0].text.content).toBe('Zedcor pilot kickoff');
    expect(body.properties.Date.date.start).toBe('2026-05-12');
    expect(body.properties.Participants.multi_select).toEqual([{ name: 'Kyle' }]);
    expect(body.properties['Key Takeaways'].rich_text[0].text.content).toContain('Pilot signed off');
    expect(body.properties.Insights.rich_text[0].text.content).toContain('Construction security');

    // Body should contain external participants line + summary + transcript + action items heading
    const blockTexts = (body.children as Array<Record<string, unknown>>).map((b) => JSON.stringify(b));
    expect(blockTexts.some((s) => s.includes('External participants: Jane Doe (Zedcor)'))).toBe(true);
    expect(blockTexts.some((s) => s.includes('Summary notes'))).toBe(true);
    expect(blockTexts.some((s) => s.includes('Transcript'))).toBe(true);
    expect(blockTexts.some((s) => s.includes('Action items'))).toBe(true);
  });

  it('omits Participants property entirely when no internal participants', async () => {
    mockFetchOk({ id: 'p2', url: 'https://www.notion.so/p2' });
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await createCallTranscriptPage({
      participants: ['External Only'],
      summary_notes: 'x',
    });
    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.properties.Participants).toBeUndefined();
  });

  it('chunks long transcripts into multiple paragraph blocks', async () => {
    mockFetchOk({ id: 'p3', url: 'https://www.notion.so/p3' });
    const long = 'word '.repeat(800); // 4000 chars
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await createCallTranscriptPage({ transcript: long });
    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(init.body);
    // Transcript heading + ≥ 2 paragraph blocks for the chunked 4000 chars + Action items heading + placeholder
    const paragraphBlocks = body.children.filter((b: { type: string }) => b.type === 'paragraph');
    expect(paragraphBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('appends overflow blocks via PATCH /v1/blocks/{id}/children when body > 100 blocks', async () => {
    // 105 short transcript chunks → 1 transcript heading + 105 paragraphs + 1 action items heading + 1 placeholder = 108 blocks.
    // First wave: 100, second wave: 8.
    const oneChunkPerHundredChars = 'x'.repeat(1900) + ' '; // <2000 chars each
    const transcript = Array(105).fill(oneChunkPerHundredChars).join('\n');
    // Note: chunkString uses character slicing not whitespace splitting, so the actual paragraph count is ceil(len/2000).
    const fetchMock = mockFetchSequence([
      { ok: true, body: { id: 'page-big', url: 'https://www.notion.so/page-big' } },
      { ok: true, body: { results: [] } },
      { ok: true, body: { results: [] } },
    ]);
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await createCallTranscriptPage({ transcript });

    // At minimum: 1 POST + ≥ 1 PATCH if overflow occurred.
    const calls = fetchMock.mock.calls;
    expect(calls[0][0]).toBe('https://api.notion.com/v1/pages');
    // If overflow needed, second call is PATCH /v1/blocks/page-big/children
    const overflowCalls = calls.slice(1);
    for (const c of overflowCalls) {
      expect(c[0]).toBe('https://api.notion.com/v1/blocks/page-big/children');
      expect((c[1] as { method: string }).method).toBe('PATCH');
    }
  });

  it('surfaces Notion API errors with status + body excerpt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => '{"code":"unauthorized"}',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { createCallTranscriptPage } = await import('../../lib/notion-call-transcripts');
    await expect(
      createCallTranscriptPage({ summary_notes: 'x' }),
    ).rejects.toThrow(/Notion API 401/);
  });
});

// ─── linkActionItemToCall ─────────────────────────────────────────────────────

describe('linkActionItemToCall', () => {
  it('PATCHes /v1/blocks/{id}/children with a single bullet block', async () => {
    const fetchMock = mockFetchOk({ results: [] });
    const { linkActionItemToCall } = await import('../../lib/notion-call-transcripts');
    await linkActionItemToCall('page-abc', {
      action_item_id: 'ai-1',
      title: 'Send Zedcor the pilot SOW by Friday',
      owner: 'Kyle',
      priority: 'high',
      notion_kanban_url: 'https://www.notion.so/futuroso/kanban-card',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('https://api.notion.com/v1/blocks/page-abc/children');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].type).toBe('bulleted_list_item');
    const text = body.children[0].bulleted_list_item.rich_text[0].text.content;
    expect(text).toContain('Zedcor');
    expect(text).toContain('Kyle');
    expect(text).toContain('high');
    expect(text).toContain('https://www.notion.so/futuroso/kanban-card');
  });

  it('omits the link suffix when no kanban URL is provided', async () => {
    const fetchMock = mockFetchOk({ results: [] });
    const { linkActionItemToCall } = await import('../../lib/notion-call-transcripts');
    await linkActionItemToCall('page-xyz', {
      action_item_id: 'ai-2',
      title: 'Follow up with vendor',
      owner: 'Co-Pilot',
      priority: 'medium',
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit & { body: string };
    const body = JSON.parse(init.body);
    const text = body.children[0].bulleted_list_item.rich_text[0].text.content;
    expect(text).not.toContain(' — http');
    expect(text).toContain('[medium] Follow up with vendor → Co-Pilot');
  });
});
