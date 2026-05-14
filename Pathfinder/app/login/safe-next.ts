/**
 * Sanitize the post-confirm redirect target. Accepts only same-origin paths
 * starting with a single `/`; protocol-relative (`//evil.com`) and absolute
 * URLs are rejected to prevent an open-redirect on the magic-link callback.
 *
 * Lives in a plain module (no `'use server'`) so it can be exported as a
 * synchronous function and re-imported from `actions.ts`. A `'use server'`
 * file may only export `async` functions — keeping this util here unblocks
 * the Next.js build.
 */
export function safeNext(next: string | undefined | null): string {
  if (!next) return '/';
  if (typeof next !== 'string') return '/';
  if (next.length > 512) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  return next;
}
