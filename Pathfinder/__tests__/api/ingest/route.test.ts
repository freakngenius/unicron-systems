// __tests__/api/ingest/route.test.ts — Sprint 1 Stream C
//
// Unit tests for the real /api/ingest POST handler.
//
// Strategy:
//   - Mock @/lib/ingest/__stubs so we can control what runIngestCall,
//     checkTaboo, and writeIngestRecords return without touching Supabase.
//   - Mock fetch globally to swallow audit_log writes.
//   - Test all auth / NO_SIGNAL / ABSTAIN / bounce / records paths.
//
// NOTE: After Stream B merges, the mock target changes from
//   @/lib/ingest/__stubs  →  actual B module paths
// The test structure stays identical.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock Stream B stubs ──────────────────────────────────────────────────────

const mockRunIngestCall = vi.fn();
const mockCheckTaboo = vi.fn();
const mockWriteIngestRecords = vi.fn();

vi.mock('@/lib/ingest/__stubs', () => ({
  runIngestCall: (...args: unknown[]) => mockRunIngestCall(...args),
  checkTaboo: (...args: unknown[]) => mockCheckTaboo(...args),
  writeIngestRecords: (...args: unknown[]) => mockWriteIngestRecords(...args),
}));

// ─── Suppress Supabase and Slack network calls ────────────────────────────────

global.fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ data: null, error: null }), { status: 200 }),
);

// ─── Env setup ────────────────────────────────────────────────────────────────

const VALID_KEY = 'test-ingest-key-123';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UNICRON_INGEST_API_KEY = VALID_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(
  body: unknown,
  apiKey: string | null = VALID_KEY,
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey !== null) headers['x-unicron-api-key'] = apiKey;

  return new NextRequest('http://localhost/api/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const validCallBody = {
  source_type: 'call',
  source_id: 'call-001',
  source_url: null,
  raw_content: 'Discussion about the new project scope.',
  participants: [{ name: 'Alice', email: 'alice@example.com' }],
  captured_at: '2026-05-06T10:00:00.000Z',
  captured_by: { type: 'human', id: '11111111-1111-1111-1111-111111111111' },
};

const validSlackBody = {
  source_type: 'slack',
  source_id: 'slack-msg-001',
  source_url: null,
  raw_content: 'Thread content here.',
  participants: [],
  captured_at: '2026-05-06T10:00:00.000Z',
  captured_by: { type: 'agent', id: '22222222-2222-2222-2222-222222222222' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ingest — auth', () => {
  it('returns 401 when x-unicron-api-key header is missing', async () => {
    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody, null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when the API key is wrong', async () => {
    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody, 'wrong-key'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when UNICRON_INGEST_API_KEY env var is not set', async () => {
    delete process.env.UNICRON_INGEST_API_KEY;
    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody, VALID_KEY));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ingest — validation', () => {
  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('@/app/api/ingest/route');
    const req = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-unicron-api-key': VALID_KEY,
      },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 400 when source_type is missing', async () => {
    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest({ ...validCallBody, source_type: undefined }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });
});

describe('POST /api/ingest — call / NO_SIGNAL', () => {
  it('returns 200 { status: NO_SIGNAL, reason } and does not call writeIngestRecords', async () => {
    mockRunIngestCall.mockResolvedValueOnce({
      status: 'NO_SIGNAL',
      reason: 'Not enough signal to extract anything meaningful.',
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('NO_SIGNAL');
    expect(body.reason).toBe('Not enough signal to extract anything meaningful.');
    expect(mockCheckTaboo).not.toHaveBeenCalled();
    expect(mockWriteIngestRecords).not.toHaveBeenCalled();
  });
});

describe('POST /api/ingest — call / ABSTAIN', () => {
  it('returns 200 { status: ABSTAIN, reason } and does not write records', async () => {
    mockRunIngestCall.mockResolvedValueOnce({
      status: 'ABSTAIN',
      reason: 'Confidence too low to trust extraction.',
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ABSTAIN');
    expect(body.reason).toContain('Confidence');
    expect(mockWriteIngestRecords).not.toHaveBeenCalled();
  });
});

describe('POST /api/ingest — call / Taboo Keeper bounce', () => {
  it('returns 200 { status: bounced } and does not call writeIngestRecords', async () => {
    mockRunIngestCall.mockResolvedValueOnce({
      status: 'records',
      ledger_row: { call_id: 'call-001', summary: 'Sensitive content here' },
      vault_doc: { path: 'calls/call-001.md', content: 'Sensitive' },
      action_items: [],
      signals: [],
    });

    // First checkTaboo call (ledger_row) returns a bounce
    mockCheckTaboo.mockResolvedValueOnce({
      verdict: 'bounce',
      reason: 'Contains PII that should not be written.',
      matched_taboo: 'pii_ssn',
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('bounced');
    expect(body.reason).toBe('Contains PII that should not be written.');
    expect(body.matched_taboo).toBe('pii_ssn');
    expect(mockWriteIngestRecords).not.toHaveBeenCalled();
  });

  it('checks action items and bounces if one matches a taboo', async () => {
    mockRunIngestCall.mockResolvedValueOnce({
      status: 'records',
      ledger_row: { call_id: 'call-002' },
      vault_doc: { path: 'calls/call-002.md', content: 'Fine' },
      action_items: [
        { title: 'Safe action' },
        { title: 'Dangerous action' },
      ],
      signals: [],
    });

    // ledger_row passes, vault_doc passes, first action_item passes, second bounces
    mockCheckTaboo
      .mockResolvedValueOnce({ verdict: 'pass' })   // ledger_row
      .mockResolvedValueOnce({ verdict: 'pass' })   // vault_doc
      .mockResolvedValueOnce({ verdict: 'pass' })   // action_item[0]
      .mockResolvedValueOnce({
        verdict: 'bounce',
        reason: 'Action item references a banned project.',
        matched_taboo: 'banned_project_ref',
      });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('bounced');
    expect(body.matched_taboo).toBe('banned_project_ref');
    expect(mockWriteIngestRecords).not.toHaveBeenCalled();
    // Should have called checkTaboo 4 times: ledger + vault + 2 action items
    expect(mockCheckTaboo).toHaveBeenCalledTimes(4);
  });
});

describe('POST /api/ingest — call / records (happy path)', () => {
  it('returns 200 { status: records, ledger_id, vault_doc_path, action_item_ids }', async () => {
    mockRunIngestCall.mockResolvedValueOnce({
      status: 'records',
      ledger_row: { call_id: 'call-003', summary: 'Good call' },
      vault_doc: { path: 'calls/call-003.md', content: 'Transcript here' },
      action_items: [{ title: 'Follow up with Alice' }],
      signals: [{ type: 'customer_pain', score: 0.9 }],
    });

    // All Taboo checks pass
    mockCheckTaboo.mockResolvedValue({ verdict: 'pass' });

    mockWriteIngestRecords.mockResolvedValueOnce({
      ledger_id: 'ledger-uuid-001',
      vault_doc_path: 'calls/call-003.md',
      action_item_ids: ['ai-uuid-001'],
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('records');
    expect(body.ledger_id).toBe('ledger-uuid-001');
    expect(body.vault_doc_path).toBe('calls/call-003.md');
    expect(body.action_item_ids).toEqual(['ai-uuid-001']);
    // checkTaboo called: 1 ledger + 1 vault + 1 action item = 3
    expect(mockCheckTaboo).toHaveBeenCalledTimes(3);
    expect(mockWriteIngestRecords).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/ingest — unimplemented source types', () => {
  it('returns 202 { status: pending } for slack source_type', async () => {
    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validSlackBody));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.note).toContain('slack');
    expect(body.note).toContain('Sprint 2+');
    // runIngestCall should NOT have been called
    expect(mockRunIngestCall).not.toHaveBeenCalled();
  });

  it('returns 202 for email source_type', async () => {
    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(
      makeRequest({
        ...validSlackBody,
        source_type: 'email',
        source_id: 'email-001',
      }),
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe('pending');
  });
});
