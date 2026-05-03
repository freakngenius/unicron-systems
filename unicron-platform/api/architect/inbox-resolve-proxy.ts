import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildQuery, forward, handleError, pipe, serializeBody } from '../_lib/proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ ok: false, error: 'missing id query param' });
    return;
  }
  try {
    const upstream = await forward({
      upstream: 'architect',
      path: `/api/architect/inbox/${encodeURIComponent(id)}/resolve`,
      method: 'POST',
      body: serializeBody(req),
      query: buildQuery(req.query, ['id']),
    });
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
