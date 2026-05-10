// api/atrium/council-deliberate.ts — Sprint 5 Stream B
// POST /api/atrium/council-deliberate
//
// Runs the LLM Council deliberation (3-stage: parallel responses → anonymous
// cross-review → Chairman synthesis) and returns a CouncilResult.
//
// Body:   { question: string, criteria: string[], context?: string }
// Returns: CouncilResult (200)
//
// Auth: checked via ATRIUM_API_KEY header or SUPABASE session.
// Audit: yes — action = 'council_deliberate' written to audit_log on success.
// Taboo: not required — deliberation is a read/advisory operation.

import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

interface RequestBody {
  question: string;
  criteria: string[];
  context?: string;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // ------------------------------------------------------------------
  // Auth — accept ATRIUM_API_KEY header or fall through (dev mode)
  // ------------------------------------------------------------------
  const apiKey = req.headers['x-atrium-api-key'] as string | undefined;
  const expectedKey = process.env.ATRIUM_API_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // ------------------------------------------------------------------
  // Parse body
  // ------------------------------------------------------------------
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', resolve);
    req.on('error', reject);
  });

  let body: RequestBody;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString()) as RequestBody;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!body.question || typeof body.question !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required field: question' }));
    return;
  }

  if (!Array.isArray(body.criteria) || body.criteria.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required field: criteria (non-empty array)' }));
    return;
  }

  // ------------------------------------------------------------------
  // Run the council
  // ------------------------------------------------------------------
  const { councilDeliberate } = await import('../../lib/agents/llm-council.js');

  let result: Awaited<ReturnType<typeof councilDeliberate>>;
  try {
    result = await councilDeliberate(body.question, body.criteria, body.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[council-deliberate] councilDeliberate failed:', message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Council deliberation failed', detail: message }));
    return;
  }

  // ------------------------------------------------------------------
  // Audit log
  // ------------------------------------------------------------------
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabase.from('audit_log').insert({
      table_name: 'council',
      action: 'council_deliberate',
      actor_id: null,
      payload: {
        question: body.question.slice(0, 200),
        criteria: body.criteria,
        winner: result.winner.slice(0, 200),
        cost_estimate: result.deliberation_cost_estimate,
      },
    });
  } catch (auditErr) {
    // Non-fatal — log but don't fail the request
    const message = auditErr instanceof Error ? auditErr.message : String(auditErr);
    console.warn('[council-deliberate] audit log write failed:', message);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}
