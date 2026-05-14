// api/atrium/accounts.ts
//
// GET /api/atrium/accounts — read-only mirror of the Notion Accounts database.
//
// Surfaces Service / Status / Category / Subscription / Account Type /
// Last Billed / Start Date / Notes. Credentials columns (API, Email, PW,
// Username) are NEVER read or returned — they are not extracted by this
// handler, so they cannot leak even if a future client adds them blindly.
//
// Grouping & sorting are computed server-side so every caller sees the same
// shape:
//   - paid:  Subscription > 0, sorted by Subscription desc
//   - free:  Subscription empty/0 OR Account Type === 'Free'
// Subtotals: paid_monthly_equivalent_usd (Yearly accounts ÷ 12), and the raw
// paid_total_usd as quoted on each row's billing cycle.
//
// Notion auth: uses the workspace NOTION_TOKEN (same secret the kanban-sync
// already relies on). The Accounts DB id is read from NOTION_DB_ACCOUNTS; if
// unset we fall back to the spec-confirmed id so the endpoint stays usable in
// preview deploys before the env var is added.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_DB_ID = '350785c6-7e72-8039-b4ee-e158a72bf35c';
const NOTION_VIEW_URL =
  'https://www.notion.so/futuroso/350785c67e728039b4eee158a72bf35c?v=350785c67e72801c9b90000cbc1186e7';

type NotionRichText = { plain_text?: string };
type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }> | null;
  number?: number | null;
  date?: { start?: string } | null;
};
type NotionPage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties: Record<string, NotionProperty>;
};

export type AccountRow = {
  notion_page_id: string;
  notion_url: string | null;
  service: string;
  status: 'Active' | 'Paused' | 'Canceled' | null;
  category: string[];
  subscription_usd: number | null;
  account_type: 'Monthly' | 'Yearly' | '1-time' | 'API' | 'Free' | null;
  last_billed: string | null;
  start_date: string | null;
  notes: string | null;
};

export type AccountsResponse = {
  notion_url: string;
  paid: AccountRow[];
  free: AccountRow[];
  paid_total_usd: number;
  paid_monthly_equivalent_usd: number;
  fetched_at: string;
};

function plainTextOf(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  if (Array.isArray(prop.title) && prop.title.length > 0) {
    const t = prop.title.map((r) => r.plain_text ?? '').join('').trim();
    return t || null;
  }
  if (Array.isArray(prop.rich_text) && prop.rich_text.length > 0) {
    const t = prop.rich_text.map((r) => r.plain_text ?? '').join('').trim();
    return t || null;
  }
  return null;
}

function selectName(prop: NotionProperty | undefined): string | null {
  return prop?.select?.name ?? null;
}

function multiSelectNames(prop: NotionProperty | undefined): string[] {
  if (!prop || !Array.isArray(prop.multi_select)) return [];
  return prop.multi_select.map((o) => o.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
}

function numberOf(prop: NotionProperty | undefined): number | null {
  if (!prop) return null;
  return typeof prop.number === 'number' ? prop.number : null;
}

function dateStart(prop: NotionProperty | undefined): string | null {
  return prop?.date?.start ?? null;
}

function extract(page: NotionPage): AccountRow {
  const props = page.properties;
  const service = plainTextOf(props['Service']) ?? '(untitled)';
  const status = selectName(props['Status']) as AccountRow['status'];
  const category = multiSelectNames(props['Category']);
  const subscription_usd = numberOf(props['Subscription']);
  const account_type = selectName(props['Account Type']) as AccountRow['account_type'];
  const last_billed = dateStart(props['Last Billed']);
  const start_date = dateStart(props['Start Date']);
  const notes = plainTextOf(props['Notes']);

  return {
    notion_page_id: page.id,
    notion_url: page.url ?? null,
    service,
    status: status ?? null,
    category,
    subscription_usd,
    account_type: account_type ?? null,
    last_billed,
    start_date,
    notes,
  };
}

function isPaid(row: AccountRow): boolean {
  return (
    typeof row.subscription_usd === 'number' &&
    row.subscription_usd > 0 &&
    row.account_type !== 'Free'
  );
}

function monthlyEquivalent(row: AccountRow): number {
  const v = row.subscription_usd ?? 0;
  if (row.account_type === 'Yearly') return v / 12;
  // Monthly / API / 1-time / null → treat as quoted
  return v;
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN not configured');
  const databaseId = process.env.NOTION_DB_ACCOUNTS ?? DEFAULT_DB_ID;

  const rows: AccountRow[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Notion query failed (${res.status}): ${text.slice(0, 240)}`);
    }

    const data = (await res.json()) as {
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    for (const page of data.results) rows.push(extract(page));
    cursor = data.has_more ? data.next_cursor ?? undefined : undefined;
  } while (cursor);

  const paid = rows.filter(isPaid).sort((a, b) => (b.subscription_usd ?? 0) - (a.subscription_usd ?? 0));
  const free = rows.filter((r) => !isPaid(r));

  const paid_total_usd = paid.reduce((sum, r) => sum + (r.subscription_usd ?? 0), 0);
  const paid_monthly_equivalent_usd = paid.reduce((sum, r) => sum + monthlyEquivalent(r), 0);

  return {
    notion_url: NOTION_VIEW_URL,
    paid,
    free,
    paid_total_usd,
    paid_monthly_equivalent_usd,
    fetched_at: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const out = await fetchAccounts();
    res.status(200).json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /\(404\)/.test(msg) ? 502 : /\(401\)/.test(msg) ? 502 : 500;
    res.status(status).json({
      error: msg,
      hint: /404/.test(msg)
        ? 'Share the Accounts database with the Unicron Orchestrator Notion integration (Notion → database → … → Connections).'
        : undefined,
    });
  }
}
