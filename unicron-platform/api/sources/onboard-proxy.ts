import type { VercelRequest, VercelResponse } from '@vercel/node';
import { forward, handleError, pipe, serializeBody } from '../_lib/proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    // Default `?sync=1` so the legacy client behavior (sync onboard) is preserved
    // even when callers don't pass it through. Caller-supplied query params win.
    const params = new URLSearchParams();
    params.set('sync', '1');
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (Array.isArray(value)) {
        params.delete(key);
        for (const v of value) params.append(key, v);
      } else if (value !== undefined) {
        params.set(key, value);
      }
    }
    const upstream = await forward({
      upstream: 'sourceOnboarder',
      path: '/api/sources/onboard',
      method: 'POST',
      body: serializeBody(req),
      query: `?${params.toString()}`,
    });
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
