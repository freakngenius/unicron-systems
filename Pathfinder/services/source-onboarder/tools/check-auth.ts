// services/source-onboarder/tools/check-auth.ts
//
// Sniffs whether a URL requires auth. Quick HEAD + small GET to inspect
// status / WWW-Authenticate / login-form signals. The agent uses the
// result to decide between Tier 1 (no auth) and Tier 2 (auth_required).

import { webFetch, webHead } from './web-fetch';
import { parseHtml } from './parse';

export type AuthType = 'none' | 'api_key' | 'oauth' | 'login' | 'unknown';

export interface CheckAuthResult {
  authType: AuthType;
  detectedFrom: 'status' | 'header' | 'login-form' | 'oauth-redirect' | 'none';
  detail: string;
}

export async function checkAuth(url: string): Promise<CheckAuthResult> {
  // 1. HEAD: 401/403 + WWW-Authenticate is the strongest signal.
  try {
    const head = await webHead(url, { timeoutMs: 8000 });
    if (head.status === 401 || head.status === 403) {
      return { authType: 'login', detectedFrom: 'status', detail: `HEAD returned ${head.status}` };
    }
  } catch {
    // ignore HEAD failures; some servers reject HEAD
  }
  // 2. GET first 64 KB. Inspect body for login form / oauth redirect / api-key hint.
  try {
    const res = await webFetch(url, { method: 'GET', maxBodyBytes: 64 * 1024, timeoutMs: 12_000 });
    if (res.status === 401 || res.status === 403) {
      return { authType: 'login', detectedFrom: 'status', detail: `GET returned ${res.status}` };
    }
    if (/oauth\/authorize|response_type=code/.test(res.body)) {
      return { authType: 'oauth', detectedFrom: 'oauth-redirect', detail: 'OAuth authorize endpoint detected' };
    }
    if (/api[_-]?key/i.test(res.body) && /required|missing|provide/i.test(res.body)) {
      return { authType: 'api_key', detectedFrom: 'header', detail: 'response mentions required api_key' };
    }
    if (/<html/i.test(res.body)) {
      const parsed = parseHtml(res.body);
      if (parsed.hasLoginForm) {
        return { authType: 'login', detectedFrom: 'login-form', detail: 'page exposes login form' };
      }
    }
    return { authType: 'none', detectedFrom: 'none', detail: 'no auth signals detected' };
  } catch (e) {
    return { authType: 'unknown', detectedFrom: 'none', detail: e instanceof Error ? e.message : String(e) };
  }
}
