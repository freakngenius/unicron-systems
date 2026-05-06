// __tests__/api/ingest/route.test.ts — Sprint 1 Stream C
//
// Unit tests for the real /api/ingest POST handler.
//
// Strategy:
//   - Mock @/lib/ingest/skills/ingest-call so we can control what ingestCall
//     returns without touching Supabase or the Anthropic API.
//   - Mock fetch globally to swallow audit_log writes.
//   - Test all auth / NO_SIGNAL / ABSTAIN / records paths.
//
// Note: taboo pre-write bounce is not tested here because ingestCall handles
// writes internally. A Sprint 2 TODO exists to expose a pre-write gate.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock ingestCall ──────────────────────────────────────────────────────────

const mockIngestCall = vi.fn();

vi.mock('@/lib/ingest/skills/ingest-call', () => ({
  ingestCall: (...args: unknown[]) => mockIngestCall(...args),
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
  it('returns 200 { status: NO_SIGNAL, reason } and does not call ingestCall for records', async () => {
    mockIngestCall.mockResolvedValueOnce({
      status: 'NO_SIGNAL',
      reason: 'Not enough signal to extract anything meaningful.',
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('NO_SIGNAL');
    expect(body.reason).toBe('Not enough signal to extract anything meaningful.');
    expect(mockIngestCall).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/ingest — call / ABSTAIN', () => {
  it('returns 200 { status: ABSTAIN, reason } and does not write records', async () => {
    mockIngestCall.mockResolvedValueOnce({
      status: 'ABSTAIN',
      reason: 'Confidence too low to trust extraction.',
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ABSTAIN');
    expect(body.reason).toContain('Confidence');
  });
});

describe('POST /api/ingest — call / records (happy path)', () => {
  it('returns 200 { status: records, ledger_id, vault_doc_path, action_item_ids }', async () => {
    mockIngestCall.mockResolvedValueOnce({
      status: 'records',
      ledger_row: { id: 'ledger-uuid-001' },
      vault_doc: { commit_sha: 'abc123def456' },
      action_items: [{ id: 'ai-uuid-001' }],
      signals: [],
    });

    const { POST } = await import('@/app/api/ingest/route');
    const res = await POST(makeRequest(validCallBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('records');
    expect(body.ledger_id).toBe('ledger-uuid-001');
    expect(body.vault_doc_path).toBe('Calls/2026-05-06-call-001.md');
    expect(body.action_item_ids).toEqual(['ai-uuid-001']);
    expect(mockIngestCall).toHaveBeenCalledTimes(1);
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
    expect(mockIngestCall).not.toHaveBeenCalled();
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
