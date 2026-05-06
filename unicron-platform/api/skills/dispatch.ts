// skills/dispatch — Sprint 2 stub.
// Returns not_yet_implemented so the client can show a graceful response.
// Sprint 3 will wire this to the nervous_system.skills registry and route
// to the appropriate Inngest function.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  res.status(200).json({
    status: 'skill_dispatch_not_yet_implemented',
    sprint: 3,
    message: 'Skill dispatch routes to Inngest in Sprint 3. Your prompt was received.',
    received_prompt: (req.body as { prompt?: string }).prompt ?? null,
  });
}
