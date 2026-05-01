// __tests__/adapters/socrata.test.ts — Phase 2 Stream E.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { socrataAdapter, validateNormalizedEvent } from '@/lib/adapters/socrata';

const SAMPLE: Record<string, unknown>[] = [
  {
    id: 'PERMIT-001',
    permit_number: 'P001',
    issue_date: '2024-04-15T00:00:00.000',
    estimated_cost: '125000',
    description: 'Tenant improvement: HVAC + electrical',
    address: '123 Main St',
    city: 'Sacramento',
    state: 'CA',
    contractor: 'ACME Build Co',
    latitude: '38.5816',
    longitude: '-121.4944',
  },
  {
    ':id': 'row2',
    application_date: '2024-04-16',
    declared_valuation: 75000,
    work_description: 'Re-roof',
  },
];

describe('socrata adapter', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('normalizes a Socrata permit row into canonical event shape', () => {
    const event = socrataAdapter.normalize(SAMPLE[0], { endpoint: 'https://data.sacramento.gov/resource/x.json', jurisdiction: 'CA' });
    expect(event.source_event_id).toBe('PERMIT-001');
    expect(event.timestamp.startsWith('2024-04-15')).toBe(true);
    expect(event.project_value).toBe(125000);
    expect(event.location?.city).toBe('Sacramento');
    expect(event.location?.lat).toBeCloseTo(38.5816, 3);
    expect(event.gc_name).toBe('ACME Build Co');
    expect(event.raw_text).toContain('HVAC');
    expect(event.jurisdiction).toBe('CA');
  });

  it('handles minimal row falling back to :id and synthetic timestamp', () => {
    const event = socrataAdapter.normalize(SAMPLE[1], { endpoint: 'https://data.sacramento.gov/resource/x.json', jurisdiction: 'CA' });
    expect(event.source_event_id).toBe('row2');
    expect(event.project_value).toBe(75000);
    expect(event.raw_text).toContain('Re-roof');
  });

  it('passes validation when required fields present', () => {
    const event = socrataAdapter.normalize(SAMPLE[0], { endpoint: 'https://data.sacramento.gov/resource/x.json', jurisdiction: 'CA' });
    expect(socrataAdapter.validate(event).ok).toBe(true);
  });

  it('fails validation when source_event_id missing', () => {
    const event = socrataAdapter.normalize({ description: 'no id row' }, { endpoint: 'https://data.sacramento.gov/resource/x.json', jurisdiction: 'CA' });
    const v = validateNormalizedEvent(event);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /source_event_id/.test(e))).toBe(true);
  });

  it('poll() forwards X-App-Token when api_key_env points at a present env var', async () => {
    process.env.MY_TOKEN = 'token-abc';
    const fetchSpy = vi.fn(async (_url: unknown, init: { headers?: Record<string, string> }) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '[]',
      json: async () => SAMPLE,
    }));
    // @ts-expect-error stub fetch
    global.fetch = fetchSpy;
    const records = await socrataAdapter.poll({
      endpoint: 'https://data.example.gov/resource/abc.json',
      api_key_env: 'MY_TOKEN',
      jurisdiction: 'CA',
    });
    expect(records).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(init?.headers?.['X-App-Token']).toBe('token-abc');
    delete process.env.MY_TOKEN;
  });

  it('poll() throws on non-200 status', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'oops',
    }));
    // @ts-expect-error stub fetch
    global.fetch = fetchSpy;
    await expect(socrataAdapter.poll({ endpoint: 'https://x/resource/y.json', jurisdiction: 'CA' })).rejects.toThrow(/socrata fetch failed/);
  });
});
