// lib/hubspot/client.ts — minimal REST wrapper for the HubSpot calls
// Pathfinder makes from the push-deal endpoint:
//
//   - POST /crm/v3/objects/deals (createDeal)
//   - POST /crm/v3/objects/notes + association (attachNote)
//   - POST /crm/v3/properties/deals (ensureCustomProperty — used by the
//     bootstrap path in lib/lead-actions.ts; idempotent)
//
// Retry policy lives here so callers don't have to think about 429s:
//   - On 429: wait Retry-After (seconds), retry. If Retry-After missing,
//     fall back to exponential backoff (300ms · 2^n + jitter, capped 30s).
//   - On 5xx: exponential backoff, max 5 attempts total.
//   - On 4xx other than 429: terminal HubspotError (no retry).
//
// Tests inject a fetch stub + setTimeout stub so the suite finishes
// instantly. Production runs against the real fetch.

export interface HubspotClient {
  createDeal: (input: { properties: Record<string, string | number> }) => Promise<{ id: string }>;
  attachNote: (input: { dealId: string; body: string }) => Promise<{ id: string }>;
  ensureCustomProperty: (input: {
    name: string;
    label: string;
    description?: string;
    type?: 'string' | 'number';
  }) => Promise<{ created: boolean }>;
}

export type HubspotLogFn = (
  eventType: string,
  data: Record<string, unknown>,
) => Promise<void> | void;

export interface CreateHubspotClientOptions {
  token: string;
  /** Override the global fetch (used by tests). */
  fetchImpl?: typeof fetch;
  /** Audit hook called on each retry / rate-limit / failure event. */
  log?: HubspotLogFn;
  /** Override the base URL (defaults to api.hubapi.com). */
  baseUrl?: string;
  /** Override the max retry count (defaults to 5). */
  maxAttempts?: number;
}

export class HubspotError extends Error {
  status: number;
  bodyText: string;

  constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.name = 'HubspotError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

const DEFAULT_BASE_URL = 'https://api.hubapi.com';
const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 300;
const BACKOFF_CAP_MS = 30_000;

function backoffMs(attempt: number): number {
  // attempt is 1-indexed; first retry uses 600ms (300 * 2^1) + jitter.
  const exp = BACKOFF_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * BACKOFF_BASE_MS);
  return Math.min(exp + jitter, BACKOFF_CAP_MS);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export function createHubspotClient(opts: CreateHubspotClientOptions): HubspotClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const log: HubspotLogFn = opts.log ?? (async () => {});

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastBodyText = '';
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${opts.token}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      lastStatus = res.status;
      lastBodyText = await res.text();

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec >= 0
          ? Math.min(retryAfterSec * 1000, BACKOFF_CAP_MS)
          : backoffMs(attempt);
        await log('rate_limited', {
          method,
          path,
          attempt,
          retry_after_seconds: Number.isFinite(retryAfterSec) ? retryAfterSec : null,
          wait_ms: waitMs,
        });
        if (attempt === maxAttempts) break;
        await sleep(waitMs);
        continue;
      }

      if (res.status >= 500) {
        await log('hubspot_5xx', { method, path, attempt, status: res.status });
        if (attempt === maxAttempts) break;
        await sleep(backoffMs(attempt));
        continue;
      }

      // 4xx other than 429 → terminal
      throw new HubspotError(
        `HubSpot ${method} ${path} → ${res.status}`,
        res.status,
        lastBodyText,
      );
    }

    throw new HubspotError(
      `HubSpot ${method} ${path} exhausted ${maxAttempts} attempts (last status ${lastStatus})`,
      lastStatus,
      lastBodyText,
    );
  }

  return {
    async createDeal(input) {
      const res = await request<{ id: string }>(
        'POST',
        '/crm/v3/objects/deals',
        { properties: input.properties },
      );
      return { id: res.id };
    },

    async attachNote(input) {
      // HubSpot v3 Notes: create a note engagement, then associate it
      // with the deal. Combined into one call shape via associations.
      // Note timestamp is required by HubSpot.
      const res = await request<{ id: string }>(
        'POST',
        '/crm/v3/objects/notes',
        {
          properties: {
            hs_note_body: input.body,
            hs_timestamp: String(Date.now()),
          },
          associations: [
            {
              to: { id: input.dealId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  // 214 = note → deal (HubSpot's predefined association id)
                  associationTypeId: 214,
                },
              ],
            },
          ],
        },
      );
      return { id: res.id };
    },

    async ensureCustomProperty(input) {
      // Try to create. HubSpot returns 409 if the property already
      // exists, which we treat as "already created" (idempotent).
      try {
        await request<unknown>('POST', '/crm/v3/properties/deals', {
          name: input.name,
          label: input.label,
          description: input.description ?? `Pathfinder-managed ${input.name}`,
          groupName: 'dealinformation',
          type: input.type ?? 'string',
          fieldType: input.type === 'number' ? 'number' : 'text',
        });
        return { created: true };
      } catch (e) {
        if (e instanceof HubspotError && e.status === 409) return { created: false };
        throw e;
      }
    },
  };
}
