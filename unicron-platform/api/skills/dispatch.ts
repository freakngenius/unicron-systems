// skills/dispatch — DEPRECATED Sprint-2 stub.
//
// Atrium audit fix item #4: previously returned 410 Gone, which surfaced as a
// hard error to any caller still pointing at the legacy URL. Now returns a 308
// Permanent Redirect to the supported endpoint `/api/atrium/skills/run`. 308
// preserves both method and request body, so POST callers that haven't yet
// updated their URL keep working.
//
// Skills are dispatched through one of:
//   - api        → POST /api/atrium/skills/run (the redirect target)
//   - agentic    → Claude Code Skill tool / slash commands (no API)
//   - ui_trigger → client-side modal (no API)
//   - scheduled  → cron (no UI click)
//
// The execution path is recorded in nervous_system.skills.execution. The
// Atrium UI reads that column and routes accordingly.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Location', '/api/atrium/skills/run');
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 21 May 2026 00:00:00 GMT');
  res.setHeader('Link', '</api/atrium/skills/run>; rel="successor-version"');
  res.setHeader('Cache-Control', 'no-store');

  // 308 Permanent Redirect — preserves method + body across the hop.
  res.status(308).json({
    ok: false,
    deprecated: true,
    redirect_to: '/api/atrium/skills/run',
    message:
      '/api/skills/dispatch was deprecated. Follow the Location header (308 redirect) to /api/atrium/skills/run. ' +
      'See nervous_system.skills.execution for the dispatch path of each skill.',
    method_received: req.method ?? 'unknown',
  });
}
