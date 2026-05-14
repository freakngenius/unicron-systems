// Tests for api/atrium/accounts.ts.
// Mocks the Notion query response. Validates extract, grouping, sort, subtotals,
// and (most importantly) that credentials columns never appear in the output.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAccounts } from './accounts';

const ORIGINAL_FETCH = global.fetch;

function pageFixture(overrides: {
  id: string;
  service: string;
  status?: 'Active' | 'Paused' | 'Canceled';
  category?: string[];
  subscription?: number | null;
  account_type?: 'Monthly' | 'Yearly' | '1-time' | 'API' | 'Free';
  last_billed?: string | null;
  start_date?: string | null;
  notes?: string | null;
  // intentionally include credential fields to prove they aren't surfaced:
  api?: string;
  email?: string;
  pw?: string;
  username?: string;
}) {
  const props: Record<string, unknown> = {
    Service: { type: 'title', title: [{ plain_text: overrides.service }] },
  };
  if (overrides.status) props['Status'] = { type: 'select', select: { name: overrides.status } };
  if (overrides.category) props['Category'] = { type: 'multi_select', multi_select: overrides.category.map((n) => ({ name: n })) };
  if (overrides.subscription !== undefined) props['Subscription'] = { type: 'number', number: overrides.subscription };
  if (overrides.account_type) props['Account Type'] = { type: 'select', select: { name: overrides.account_type } };
  if (overrides.last_billed) props['Last Billed'] = { type: 'date', date: { start: overrides.last_billed } };
  if (overrides.start_date) props['Start Date'] = { type: 'date', date: { start: overrides.start_date } };
  if (overrides.notes) props['Notes'] = { type: 'rich_text', rich_text: [{ plain_text: overrides.notes }] };
  // Credentials — present on the page but should be ignored by the extractor:
  if (overrides.api) props['API'] = { type: 'rich_text', rich_text: [{ plain_text: overrides.api }] };
  if (overrides.email) props['Email'] = { type: 'email', email: overrides.email };
  if (overrides.pw) props['PW'] = { type: 'rich_text', rich_text: [{ plain_text: overrides.pw }] };
  if (overrides.username) props['Username'] = { type: 'rich_text', rich_text: [{ plain_text: overrides.username }] };

  return {
    id: overrides.id,
    url: `https://www.notion.so/${overrides.id.replace(/-/g, '')}`,
    last_edited_time: '2026-05-13T00:00:00.000Z',
    properties: props,
  };
}

describe('fetchAccounts', () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = 'test-token';
    process.env.NOTION_DB_ACCOUNTS = '350785c6-7e72-8039-b4ee-e158a72bf35c';
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('groups paid (sub > 0) above free/trial and sorts paid desc', async () => {
    const results = [
      pageFixture({ id: 'p1', service: 'OpenAI',     subscription: 200, account_type: 'Monthly', status: 'Active', category: ['AI'] }),
      pageFixture({ id: 'p2', service: 'Anthropic',  subscription: 50,  account_type: 'Monthly', status: 'Active', category: ['AI'] }),
      pageFixture({ id: 'p3', service: 'Vercel',     subscription: 240, account_type: 'Yearly',  status: 'Active', category: ['Infrastructure'] }),
      pageFixture({ id: 'f1', service: 'Notion Free',subscription: 0,   account_type: 'Free',    status: 'Active', category: ['Communication'] }),
      pageFixture({ id: 'f2', service: 'GitHub',     subscription: null,                          status: 'Active', category: ['Infrastructure'] }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results, has_more: false }),
    }) as unknown as typeof fetch;

    const out = await fetchAccounts();
    expect(out.paid.map((r) => r.service)).toEqual(['Vercel', 'OpenAI', 'Anthropic']);
    expect(out.free.map((r) => r.service).sort()).toEqual(['GitHub', 'Notion Free']);
    // paid_total = 240 + 200 + 50 = 490
    expect(out.paid_total_usd).toBe(490);
    // monthly equivalent: 240/12 + 200 + 50 = 270
    expect(out.paid_monthly_equivalent_usd).toBe(270);
  });

  it('never surfaces credential properties (API, Email, PW, Username)', async () => {
    const results = [
      pageFixture({
        id: 'p1', service: 'Linear', subscription: 12, account_type: 'Monthly',
        api: 'lin_api_supersecret_xxxxx',
        email: 'kyle@example.com',
        pw: 'hunter2',
        username: 'kekas',
      }),
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results, has_more: false }),
    }) as unknown as typeof fetch;

    const out = await fetchAccounts();
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('lin_api_supersecret');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('kyle@example.com');
    expect(serialized).not.toContain('kekas');
    // And no per-row credentials keys:
    expect(Object.keys(out.paid[0])).not.toContain('api');
    expect(Object.keys(out.paid[0])).not.toContain('email');
    expect(Object.keys(out.paid[0])).not.toContain('pw');
    expect(Object.keys(out.paid[0])).not.toContain('username');
  });

  it('treats Account Type = Free as free even if subscription > 0 (edge case)', async () => {
    const results = [
      pageFixture({ id: 'x', service: 'TrialPaid', subscription: 99, account_type: 'Free' }),
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results, has_more: false }),
    }) as unknown as typeof fetch;

    const out = await fetchAccounts();
    expect(out.paid).toHaveLength(0);
    expect(out.free).toHaveLength(1);
  });

  it('propagates a 404 from Notion with the share-DB hint message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'database not shared',
    }) as unknown as typeof fetch;

    await expect(fetchAccounts()).rejects.toThrow(/404/);
  });

  it('paginates when has_more is true', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { start_cursor?: string };
      calls.push(body.start_cursor ?? 'first');
      if (!body.start_cursor) {
        return {
          ok: true,
          json: async () => ({
            results: [pageFixture({ id: 'p1', service: 'A', subscription: 10, account_type: 'Monthly' })],
            has_more: true,
            next_cursor: 'cursor-2',
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          results: [pageFixture({ id: 'p2', service: 'B', subscription: 20, account_type: 'Monthly' })],
          has_more: false,
        }),
      };
    }) as unknown as typeof fetch;

    const out = await fetchAccounts();
    expect(calls).toEqual(['first', 'cursor-2']);
    expect(out.paid.map((r) => r.service)).toEqual(['B', 'A']);
  });
});
