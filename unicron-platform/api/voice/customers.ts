// GET /api/voice/customers
//
// Source of truth for the "Assign to customer" dropdown in agent creation.
// Returns all rows from pathfinder.customers, ordered by name. Behind
// requireVoiceAccess (Bearer JWT + metacron.operator_allowlist).
//
// Translated from prototype src/app/api/customers/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sb = getPathfinderServiceClient();
  const { data, error } = await sb
    .from('customers')
    .select('id, name, served_by_branch_id, monthly_value')
    .order('name');
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  res.status(200).json({ ok: true, customers: data ?? [] });
}
