import type { VercelRequest, VercelResponse } from '@vercel/node';
import { forward, handleError, pipe, serializeBody } from '../_lib/proxy.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const upstream = await forward({
      upstream: 'architect',
      path: '/api/architect/discover',
      method: 'POST',
      body: serializeBody(req),
    });
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
