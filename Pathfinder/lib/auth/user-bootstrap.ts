// lib/auth/user-bootstrap.ts — Gate 13Y-A multi-rep identity resolution.
//
// Lazy bootstrap layer that maps the basic-auth operator email to a
// pathfinder.users row. Created in 13Y-A but NOT yet wired into any
// production code path — the existing getCurrentUserId() in
// lib/connectors/auth.ts continues to return the operator email until
// 13Y-D performs the swap. This file ships now so 13Y-B/C/D can import
// resolveUserId() from a stable surface.
//
// Behavior:
//   - When MULTI_REP_ENABLED=0 (or unset), resolveUserId() returns null.
//     Callers fall back to the legacy operator-email identity.
//   - When MULTI_REP_ENABLED=1, resolveUserId() looks up users.email =
//     getOperatorEmail(req). If absent, lazy-upserts a row scoped to the
//     'unicron-internal' org with role 'admin' (matching the migration
//     0120 backfill). Returns { id, orgId, role } on success.
//
// Supabase typing: this module uses the per-call `as unknown as { ... }`
// cast pattern from lib/deals.ts (see lines 93, 199) for insert ops.
// Reads via select('*') destructure cleanly without casts.

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getOperatorEmail } from '@/lib/connectors/auth';
import { multiRepEnabled } from '@/lib/feature-flags';
import { supabaseAdmin } from '@/lib/supabase';
import type { CustomerOrg, PathfinderDatabase, User, UserRole } from '@/lib/types';

const UNICRON_INTERNAL_ORG_SLUG = 'unicron-internal';

export type ResolvedUser = {
  id: string;
  orgId: string;
  role: UserRole;
  email: string;
};

type Client = SupabaseClient<PathfinderDatabase, 'pathfinder'>;

type SupabaseResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Production entry point. Reads the env flag + the basic-auth principal
 * and returns the resolved users row, lazy-bootstrapping if needed.
 *
 * Returns null in three cases:
 *   1. The feature flag is off (legacy fallback active).
 *   2. The request is not authed as an operator.
 *   3. The lazy upsert fails (logged; caller should 401/403).
 */
export async function resolveUserId(req: NextRequest): Promise<ResolvedUser | null> {
  if (!multiRepEnabled()) return null;
  const email = getOperatorEmail(req);
  if (!email) return null;
  return bootstrapUserByEmail(email, supabaseAdmin());
}

/**
 * Pure (modulo Supabase IO) helper that looks up or upserts a users row
 * for the given email. Exposed for test injection — production callers
 * should use resolveUserId().
 *
 * Idempotent: calling twice for the same email yields a single row and
 * the same ResolvedUser on both calls.
 */
export async function bootstrapUserByEmail(
  email: string,
  client: Client,
): Promise<ResolvedUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const lookupResult = (await client
    .from('users')
    .select('*')
    .eq('email', normalized)
    .maybeSingle()) as SupabaseResult<User>;

  if (lookupResult.error) {
    console.error('[user-bootstrap] lookup failed', lookupResult.error);
    return null;
  }

  if (lookupResult.data) {
    return toResolved(lookupResult.data);
  }

  // Not found — find the unicron-internal org and insert.
  const orgResult = (await client
    .from('customer_orgs')
    .select('*')
    .eq('slug', UNICRON_INTERNAL_ORG_SLUG)
    .maybeSingle()) as SupabaseResult<CustomerOrg>;

  if (orgResult.error || !orgResult.data) {
    console.error(
      '[user-bootstrap] unicron-internal org missing — migration 0120 not applied?',
      orgResult.error,
    );
    return null;
  }

  const orgId = orgResult.data.id;

  // Race-tolerant insert: if a concurrent request inserted between the
  // lookup and here, the unique(email) constraint trips and we fall back
  // to a re-read. Cast through `unknown` mirrors the lib/deals.ts pattern.
  const insertResult = (await (
    client.from('users') as unknown as {
      insert: (row: Record<string, unknown>) => {
        select: () => { maybeSingle: () => Promise<SupabaseResult<User>> };
      };
    }
  )
    .insert({
      email: normalized,
      customer_org_id: orgId,
      role: 'admin',
      name: null,
    })
    .select()
    .maybeSingle()) as SupabaseResult<User>;

  if (insertResult.error) {
    const reread = (await client
      .from('users')
      .select('*')
      .eq('email', normalized)
      .maybeSingle()) as SupabaseResult<User>;
    if (reread.data) return toResolved(reread.data);
    console.error(
      '[user-bootstrap] insert failed and re-read empty',
      insertResult.error,
    );
    return null;
  }

  if (!insertResult.data) return null;
  return toResolved(insertResult.data);
}

function toResolved(row: User): ResolvedUser {
  return {
    id: row.id,
    orgId: row.customer_org_id,
    role: row.role,
    email: row.email,
  };
}
