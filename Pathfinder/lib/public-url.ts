// lib/public-url.ts — single source of truth for the user-facing
// Pathfinder URL. Used by anything that emits an absolute link the user
// clicks (email body, Slack message, etc.).
//
// Rendered at request time so a deploy that changes PATHFINDER_PUBLIC_URL
// updates outbound links on the next briefing without a code change.
//
// Default: https://www.unicron.systems/pathfinder — the canonical proxy
// host. The Vercel-deployment hostname (pathfinder-ashy.vercel.app) is
// never canonical for outbound links because the parent unicron-systems
// project rewrites the proxy and we don't want to leak that internal
// host into customer-facing emails.

export function publicUrl(): string {
  return process.env.PATHFINDER_PUBLIC_URL ?? 'https://www.unicron.systems/pathfinder';
}
