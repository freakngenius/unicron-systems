// api/atrium/elder-advise.ts — Sprint 3 Stream B
// POST /api/atrium/elder-advise
// Body: { decision_type: string, scope: string, summary: string }
// Returns: ElderAdvisory

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

  let body: { decision_type: string; scope: string; summary: string };
  try {
    body = JSON.parse(Buffer.concat(chunks).toString()) as {
      decision_type: string;
      scope: string;
      summary: string;
    };
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!body.decision_type || !body.scope || !body.summary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required fields: decision_type, scope, summary' }));
    return;
  }

  const { elderAdvise } = await import('../../lib/agents/elder.js');
  const advisory = await elderAdvise(body.decision_type, body.scope, body.summary);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(advisory));
}
