// api/atrium/verify-gate.ts — Sprint 3 Stream B
// POST /api/atrium/verify-gate
// Body: { action_item_id: string }
// Returns: VerifyGateResult (200 = allowed, 403 = blocked)

import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', resolve);
    req.on('error', reject);
  });

  let body: { action_item_id: string };
  try {
    body = JSON.parse(Buffer.concat(chunks).toString()) as { action_item_id: string };
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!body.action_item_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required field: action_item_id' }));
    return;
  }

  const { runVerifyGate } = await import('../../lib/agents/verify-gate.js');
  const result = await runVerifyGate(body.action_item_id);

  res.writeHead(result.allowed ? 200 : 403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}
