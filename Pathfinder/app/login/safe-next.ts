/**
 * Sanitize the post-confirm redirect target. Accepts only same-origin paths
 * starting with a single `/`; protocol-relative (`//evil.com`) and absolute
 * URLs are rejected to prevent an open-redirect on the magic-link callback.
 *
 * Extracted from `app/login/actions.ts` so it can be exported without
 * violating Next.js's "all exports from a 'use server' file must be async
 * server actions" rule (the Vercel build failure that blocked PR #424's
 * pathfinder preview on 2026-05-14).
 */
export function safeNext(next: string | undefined | null): string {
  if (!next) return '/';
  if (typeof next !== 'string') return '/';
  if (next.length > 512) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  return next;
}
