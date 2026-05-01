// services/source-onboarder/tools/web-fetch.ts
//
// Capped HTTP fetch with content-type sniffing. Per SPEC §9 cost discipline:
// max 30 webFetch calls per session (enforced in agent.ts via the session
// counters; tools are stateless).

export interface WebFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
}

export interface WebFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;          // truncated to maxBodyBytes
  truncated: boolean;
  url: string;
  redirected: boolean;
  finalUrl: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_MAX_BODY_BYTES = 512 * 1024; // 512 KB; classification + sample only

export async function webFetch(url: string, opts: WebFetchOptions = {}): Promise<WebFetchResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  const maxBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'User-Agent': 'Unicron-SourceOnboarder/0.1 (+https://unicron.systems)',
        Accept: '*/*',
        ...(opts.headers ?? {}),
      },
      body: opts.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') ?? '';
    const reader = res.body?.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let bytes = 0;
    let buffer = '';
    let truncated = false;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        buffer += decoder.decode(value, { stream: true });
        if (bytes >= maxBytes) {
          truncated = true;
          try { reader.cancel(); } catch { /* ignore */ }
          break;
        }
      }
      buffer += decoder.decode();
    } else {
      buffer = await res.text();
    }
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      body: buffer,
      truncated,
      url,
      redirected: res.redirected,
      finalUrl: res.url || url,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// HEAD request — used by checkAuth.
export async function webHead(url: string, opts: WebFetchOptions = {}): Promise<Pick<WebFetchResult, 'ok' | 'status' | 'contentType' | 'finalUrl'>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Unicron-SourceOnboarder/0.1',
        ...(opts.headers ?? {}),
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      finalUrl: res.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}
