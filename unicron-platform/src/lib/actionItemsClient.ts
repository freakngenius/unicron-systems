// actionItemsClient.ts — Sprint 4 Stream D
//
// Client stub for PATCH /api/atrium/action-items/:id
//
// The endpoint lives in the Pathfinder Next.js project (not here — unicron-
// platform is a Vite app with no server-side API routes). It is deployed at:
//   https://pathfinder-ashy.vercel.app/api/atrium/action-items/:id
// and is proxied through unicron.systems/pathfinder/* at runtime.
//
// TODO (Pathfinder-side follow-up): implement
//   Pathfinder/app/api/atrium/action-items/[id]/route.ts
// The implementation skeleton is already committed in the same PR for reference.
//
// Auth: the PATCH endpoint checks the `x-unicron-api-key` header against the
// UNICRON_INTERNAL_API_KEY secret stored in Vercel. The value must be set in
// the Atrium runtime environment as VITE_UNICRON_INTERNAL_API_KEY.

const ACTION_ITEMS_BASE_URL =
  import.meta.env.VITE_PATHFINDER_INTERNAL_URL ??
  'https://pathfinder-ashy.vercel.app';

const INTERNAL_API_KEY =
  (import.meta.env.VITE_UNICRON_INTERNAL_API_KEY as string | undefined) ?? '';

export interface ActionItemPatch {
  dri?: string;
  status?: 'open' | 'in_progress' | 'done' | 'blocked' | 'broken_off';
  deferred_to?: string;
  closed?: boolean;
  // Sprint 8 F5: explicit completion. UI checkbox toggle path.
  completed?: boolean;
  completed_by?: string;
}

export interface ActionItemPatched {
  id: string;
  title: string;
  status: string;
  dri: string | null;
  updated_at: string;
  completed?: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
}

/**
 * PATCH a single action item via the Pathfinder API route.
 *
 * Throws on network failure or non-2xx response (including 403 Taboo Keeper
 * refusal — the thrown error message contains the taboo text).
 */
export async function patchActionItem(
  id: string,
  patch: ActionItemPatch,
): Promise<ActionItemPatched> {
  const url = `${ACTION_ITEMS_BASE_URL}/api/atrium/action-items/${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-unicron-api-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; taboo?: string };
    const message =
      body.taboo ??
      body.error ??
      `PATCH /api/atrium/action-items/${id} failed with status ${res.status}`;
    throw new Error(message);
  }

  return res.json() as Promise<ActionItemPatched>;
}
