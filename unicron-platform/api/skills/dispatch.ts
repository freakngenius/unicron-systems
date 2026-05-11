// skills/dispatch — DEPRECATED Sprint-2 stub.
//
// This endpoint never advanced past the stub state. Skills are now dispatched
// through one of:
//   - api        → POST /api/atrium/skills/run
//   - agentic    → Claude Code Skill tool / slash commands (no API)
//   - ui_trigger → client-side modal (no API)
//   - scheduled  → cron (no UI click)
//
// The execution path is recorded in nervous_system.skills.execution. The
// Atrium UI reads that column and routes accordingly. This endpoint is kept
// to fail loudly so any old caller surfaces immediately instead of silently
// receiving "skill_dispatch_not_yet_implemented".

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(410).json({
    ok: false,
    error: 'gone',
    message:
      '/api/skills/dispatch was deprecated. Use /api/atrium/skills/run for API skills, or invoke agentic skills through Claude Code. See nervous_system.skills.execution for the dispatch path of each skill.',
  });
}
