// lib/slack/client.ts — shared Slack Web API helpers
//
// Thin fetch wrapper used by the daily-scan + membership-audit code paths.
// We intentionally do not pull in @slack/web-api — keeps the cold-start path
// small and lines up with existing chat.postMessage usage in
// lib/agents/{analyst,orchestrator}.ts.

const SLACK_API = 'https://slack.com/api';

export class SlackApiError extends Error {
  method: string;
  slackError: string;
  response?: unknown;
  /** HTTP status, if available (e.g. 429 for rate-limited requests). */
  httpStatus?: number;
  /** Retry-After value in seconds for rate-limited requests, if Slack returned one. */
  retryAfterSec?: number;

  constructor(
    method: string,
    slackError: string,
    response?: unknown,
    httpStatus?: number,
    retryAfterSec?: number,
  ) {
    super(`[slack] ${method} failed: ${slackError}`);
    this.name = 'SlackApiError';
    this.method = method;
    this.slackError = slackError;
    this.response = response;
    this.httpStatus = httpStatus;
    this.retryAfterSec = retryAfterSec;
  }
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  response_metadata?: { next_cursor?: string };
  [key: string]: unknown;
}

function getToken(): string {
  const token = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
  if (!token) {
    throw new Error('SLACK_ORCHESTRATOR_BOT_TOKEN not set');
  }
  return token;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function parseSlackResponse(
  res: Response,
  method: string,
): Promise<SlackResponse> {
  // Slack rate limiting → HTTP 429 + Retry-After header. Surface as a
  // structured SlackApiError so callers (notably the S2 fan-out scan)
  // can back off without having to inspect raw HTTP.
  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    throw new SlackApiError(method, 'ratelimited', undefined, 429, retryAfter);
  }
  let body: SlackResponse;
  try {
    body = (await res.json()) as SlackResponse;
  } catch {
    throw new SlackApiError(
      method,
      `http_${res.status}_non_json`,
      undefined,
      res.status,
    );
  }
  if (!body.ok) {
    throw new SlackApiError(
      method,
      body.error ?? 'unknown_error',
      body,
      res.status,
    );
  }
  return body;
}

/**
 * GET an endpoint with query params.
 * Slack's WebAPI is permissive about GET vs POST for most read methods.
 */
export async function slackGet<T = SlackResponse>(
  method: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const token = getToken();
  const url = new URL(`${SLACK_API}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await parseSlackResponse(res, method)) as T;
}

/**
 * POST a JSON body.
 */
export async function slackPost<T = SlackResponse>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
  return (await parseSlackResponse(res, method)) as T;
}

/**
 * Iterate a paginated cursor-based endpoint, yielding the raw response
 * body for each page. Caller is responsible for extracting the array.
 */
export async function* slackPaginated<T extends SlackResponse>(
  method: string,
  params: Record<string, string | number | boolean | undefined> = {},
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await slackGet<T>(method, { ...params, cursor });
    yield page;
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
}
