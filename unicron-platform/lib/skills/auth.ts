// lib/skills/auth.ts — Sprint 9 Stream B
//
// Shared auth helper for the new procedural-memory Skills API endpoints.
// Mirrors the auth scheme used by api/atrium/skills/run.ts:
//
//   - x-unicron-api-key: shared internal key (UNICRON_INTERNAL_API_KEY)
//   - Authorization: Bearer <supabase access token> with email on the
//     ATRIUM_EMAIL_ALLOWLIST (Kyle, Keenan, Curtis, team@)
//
// Outside production, when no internal key is configured, we allow the
// call through so local dev does not need to wire env to test endpoints.
// This mirrors the existing run.ts behavior verbatim.

import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export type AuthOutcome =
  | { ok: true; mode: 'internal' | 'session'; email?: string }
  | { ok: false; status: number; error: string };

export async function checkSkillsAuth(req: VercelRequest): Promise<AuthOutcome> {
  const internalKey = process.env.UNICRON_INTERNAL_API_KEY;
  const provided = req.headers['x-unicron-api-key'];
  if (internalKey && provided === internalKey) {
    return { ok: true, mode: 'internal' };
  }

  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return { ok: false, status: 401, error: 'empty bearer token' };

    const allowlist = (process.env.ATRIUM_EMAIL_ALLOWLIST ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length === 0) {
      return { ok: false, status: 500, error: 'ATRIUM_EMAIL_ALLOWLIST not configured' };
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return {
        ok: false,
        status: 500,
        error: 'supabase url/anon key not configured for session auth',
      };
    }

    const sb = createClient(url, anonKey);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user?.email) {
      return { ok: false, status: 401, error: 'invalid bearer token' };
    }
    const email = data.user.email.toLowerCase();
    if (!allowlist.includes(email)) {
      return { ok: false, status: 403, error: 'caller not on Atrium operator allowlist' };
    }
    return { ok: true, mode: 'session', email };
  }

  if (!internalKey && process.env.VERCEL_ENV !== 'production') {
    return { ok: true, mode: 'internal' };
  }

  return { ok: false, status: 401, error: 'unauthorized' };
}
