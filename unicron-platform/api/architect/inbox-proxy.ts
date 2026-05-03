import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildQuery, forward, handleError, pipe } from '../_lib/proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const upstream = await forward({
      upstream: 'architect',
      path: '/api/architect/inbox',
      method: 'GET',
      query: buildQuery(req.query),
    });
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
