// tests/gate13y-user-schema.test.ts — Gate 13Y-A multi-rep schema + bootstrap.
//
// Three concerns:
//   1. Migration 0120_users_teams.sql — confirm shape (tables, columns,
//      FK policies, idempotency guards) by reading the file as text.
//   2. multiRepEnabled() — flag reader correctness.
//   3. bootstrapUserByEmail() — flag-off path returns null via resolveUserId,
//      flag-on returns existing rows, lazy-upserts missing rows, and is
//      idempotent against a unique-constraint race.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { multiRepEnabled } from '@/lib/feature-flags';
import type { PathfinderDatabase } from '@/lib/types';

const MIGRATION_PATH = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '0120_users_teams.sql',
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

// ---------------------------------------------------------------------------
// 1. Migration shape — text-level assertions over the SQL file
// ---------------------------------------------------------------------------

describe('migration 0120 — shape', () => {
  it('creates the three additive tables in pathfinder schema', () => {
    expect(MIGRATION_SQL).toMatch(
      /create table if not exists pathfinder\.customer_orgs/i,
    );
    expect(MIGRATION_SQL).toMatch(/create table if not exists pathfinder\.users/i);
    expect(MIGRATION_SQL).toMatch(
      /create table if not exists pathfinder\.deal_assignments/i,
    );
  });

  it('declares users.role as a check-constrained enum string', () => {
    expect(MIGRATION_SQL).toMatch(
      /role\s+text not null check \(role in \('admin','rep','viewer'\)\)/,
    );
  });

  it('declares deal_assignments.status check constraint', () => {
    expect(MIGRATION_SQL).toMatch(
      /status\s+text not null check \(status in \('active','transferred','revoked'\)\)/,
    );
  });

  it('uses the agreed FK policies on deal_assignments', () => {
    // deal_id CASCADE
    expect(MIGRATION_SQL).toMatch(
      /deal_id\s+uuid not null references pathfinder\.deals\(id\) on delete cascade/,
    );
    // user_id CASCADE
    expect(MIGRATION_SQL).toMatch(
      /user_id\s+uuid not null references pathfinder\.users\(id\) on delete cascade/,
    );
    // assigned_by SET NULL
    expect(MIGRATION_SQL).toMatch(
      /assigned_by\s+uuid references pathfinder\.users\(id\) on delete set null/,
    );
  });

  it('declares users.customer_org_id as RESTRICT (no accidental org delete)', () => {
    expect(MIGRATION_SQL).toMatch(
      /customer_org_id\s+uuid not null references pathfinder\.customer_orgs\(id\) on delete restrict/,
    );
  });

  it('backfills the canonical operator email kyle@demystified.ai', () => {
    expect(MIGRATION_SQL).toContain("'kyle@demystified.ai'");
    // Operator decision: ignore the historical kyle@freakngenius.com git-email
    // artifact. Anything else routes through lib/auth/user-bootstrap.ts on
    // first authed request.
    expect(MIGRATION_SQL).not.toContain('kyle@freakngenius.com');
  });

  it('backfills the unicron-internal customer org', () => {
    expect(MIGRATION_SQL).toContain("'unicron-internal'");
    expect(MIGRATION_SQL).toContain("'Unicron Internal'");
  });

  it('is idempotent — every CREATE TABLE has IF NOT EXISTS, every backfill INSERT has ON CONFLICT', () => {
    // No bare CREATE TABLE without the guard.
    const createTableMatches = MIGRATION_SQL.match(/create table\s+(?!if not exists)/gi);
    expect(createTableMatches).toBeNull();

    // Both backfill INSERTs must have ON CONFLICT DO NOTHING.
    const inserts = MIGRATION_SQL.match(/insert into pathfinder\./gi) ?? [];
    expect(inserts.length).toBe(2);
    const conflicts = MIGRATION_SQL.match(/on conflict \([^)]+\) do nothing/gi) ?? [];
    expect(conflicts.length).toBe(2);
  });

  it('enables RLS on all three new tables', () => {
    expect(MIGRATION_SQL).toMatch(
      /alter table pathfinder\.customer_orgs enable row level security/,
    );
    expect(MIGRATION_SQL).toMatch(
      /alter table pathfinder\.users enable row level security/,
    );
    expect(MIGRATION_SQL).toMatch(
      /alter table pathfinder\.deal_assignments enable row level security/,
    );
  });

  it('grants service_role write + anon/authenticated read (matches 0050 pattern)', () => {
    // Six policies total: read + write × 3 tables.
    const readPolicies = MIGRATION_SQL.match(/for select\s+to anon, authenticated/gi) ?? [];
    expect(readPolicies.length).toBe(3);
    const writePolicies = MIGRATION_SQL.match(/for all\s+to service_role/gi) ?? [];
    expect(writePolicies.length).toBe(3);
  });

  it('does NOT introduce destructive ALTER on existing tables', () => {
    expect(MIGRATION_SQL).not.toMatch(/drop table/i);
    // The only DROP allowed is "drop policy if exists" for the migration's
    // own policies — never against other tables. Confirm no other DROP forms.
    expect(MIGRATION_SQL).not.toMatch(/drop column/i);
    expect(MIGRATION_SQL).not.toMatch(/drop constraint/i);
  });

  it('does NOT touch deals, projects, agent_runs, or cross-pollination tables', () => {
    expect(MIGRATION_SQL).not.toMatch(/alter table pathfinder\.deals\b/i);
    expect(MIGRATION_SQL).not.toMatch(/alter table pathfinder\.projects/i);
    expect(MIGRATION_SQL).not.toMatch(/alter table pathfinder\.agent_runs/i);
    expect(MIGRATION_SQL).not.toMatch(/lead_cross_pollination/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Feature flag reader
// ---------------------------------------------------------------------------

describe('multiRepEnabled', () => {
  const original = process.env.MULTI_REP_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MULTI_REP_ENABLED;
    } else {
      process.env.MULTI_REP_ENABLED = original;
    }
  });

  it('returns false when env is undefined (production default pre-flag-flip)', () => {
    delete process.env.MULTI_REP_ENABLED;
    expect(multiRepEnabled()).toBe(false);
  });

  it("returns false for env values other than the literal '1'", () => {
    for (const value of ['0', 'false', 'true', 'yes', '']) {
      process.env.MULTI_REP_ENABLED = value;
      expect(multiRepEnabled()).toBe(false);
    }
  });

  it("returns true when env is exactly '1'", () => {
    process.env.MULTI_REP_ENABLED = '1';
    expect(multiRepEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. user-bootstrap behavior — mocked supabase
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => mockClient,
}));

// Mock supabase client. Each test resets it.
let mockClient: SupabaseClient<PathfinderDatabase, 'pathfinder'>;

type MaybeSingle<T> = { data: T | null; error: { message: string } | null };

function makeChain(result: MaybeSingle<unknown>) {
  // .from(...).select(...).eq(...).maybeSingle()
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeInsertChain(result: MaybeSingle<unknown>) {
  // .from(...).insert(...).select(...).maybeSingle()
  const chain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe('resolveUserId / bootstrapUserByEmail', () => {
  const originalFlag = process.env.MULTI_REP_ENABLED;

  beforeEach(() => {
    delete process.env.MULTI_REP_ENABLED;
    mockClient = {
      from: vi.fn(),
    } as unknown as SupabaseClient<PathfinderDatabase, 'pathfinder'>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFlag === undefined) {
      delete process.env.MULTI_REP_ENABLED;
    } else {
      process.env.MULTI_REP_ENABLED = originalFlag;
    }
  });

  it('resolveUserId returns null when flag is off (legacy fallback active)', async () => {
    delete process.env.MULTI_REP_ENABLED;
    const { resolveUserId } = await import('@/lib/auth/user-bootstrap');
    const fakeReq = {
      headers: { get: () => 'kyle@demystified.ai' },
      url: 'https://example.test/whatever',
    } as unknown as Parameters<typeof resolveUserId>[0];
    expect(await resolveUserId(fakeReq)).toBeNull();
  });

  it('bootstrapUserByEmail returns existing user without inserting', async () => {
    const userRow = {
      id: 'uuid-existing',
      customer_org_id: 'uuid-org',
      role: 'admin',
      email: 'kyle@demystified.ai',
    };
    const lookupChain = makeChain({ data: userRow, error: null });
    (mockClient.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'users') return lookupChain;
      throw new Error(`unexpected table ${table}`);
    });

    const { bootstrapUserByEmail } = await import('@/lib/auth/user-bootstrap');
    const result = await bootstrapUserByEmail('kyle@demystified.ai', mockClient);

    expect(result).toEqual({
      id: 'uuid-existing',
      orgId: 'uuid-org',
      role: 'admin',
      email: 'kyle@demystified.ai',
    });
    // Only the users lookup happened; no org or insert.
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it('lazy-upserts when user is missing — looks up org, inserts, returns new row', async () => {
    const userLookupEmpty = makeChain({ data: null, error: null });
    const orgLookup = makeChain({ data: { id: 'uuid-org' }, error: null });
    const insertChain = makeInsertChain({
      data: {
        id: 'uuid-new',
        customer_org_id: 'uuid-org',
        role: 'admin',
        email: 'newrep@demystified.ai',
      },
      error: null,
    });

    (mockClient.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'users') {
        // First call (lookup) returns empty; second call (insert) returns row.
        return userLookupEmpty.maybeSingle.mock.calls.length === 0
          ? userLookupEmpty
          : insertChain;
      }
      if (table === 'customer_orgs') return orgLookup;
      throw new Error(`unexpected table ${table}`);
    });

    const { bootstrapUserByEmail } = await import('@/lib/auth/user-bootstrap');
    const result = await bootstrapUserByEmail('newrep@demystified.ai', mockClient);

    expect(result).toEqual({
      id: 'uuid-new',
      orgId: 'uuid-org',
      role: 'admin',
      email: 'newrep@demystified.ai',
    });
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newrep@demystified.ai',
        customer_org_id: 'uuid-org',
        role: 'admin',
      }),
    );
  });

  it('normalizes email (trim + lowercase) before lookup and insert', async () => {
    const lookupChain = makeChain({
      data: {
        id: 'uuid-x',
        customer_org_id: 'uuid-org',
        role: 'rep',
        email: 'kyle@demystified.ai',
      },
      error: null,
    });
    (mockClient.from as ReturnType<typeof vi.fn>).mockImplementation(
      (_table: string) => lookupChain,
    );

    const { bootstrapUserByEmail } = await import('@/lib/auth/user-bootstrap');
    const result = await bootstrapUserByEmail('  KYLE@Demystified.AI  ', mockClient);
    expect(result?.email).toBe('kyle@demystified.ai');
    expect(lookupChain.eq).toHaveBeenCalledWith('email', 'kyle@demystified.ai');
  });

  it('returns null when unicron-internal org is missing (migration not applied)', async () => {
    const userLookupEmpty = makeChain({ data: null, error: null });
    const orgLookupEmpty = makeChain({ data: null, error: null });
    (mockClient.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'users') return userLookupEmpty;
      if (table === 'customer_orgs') return orgLookupEmpty;
      throw new Error(`unexpected table ${table}`);
    });

    const { bootstrapUserByEmail } = await import('@/lib/auth/user-bootstrap');
    expect(await bootstrapUserByEmail('newrep@demystified.ai', mockClient)).toBeNull();
  });

  it('is race-tolerant — insert collision falls back to re-read', async () => {
    const lookupEmpty = makeChain({ data: null, error: null });
    const orgLookup = makeChain({ data: { id: 'uuid-org' }, error: null });
    const insertCollision = makeInsertChain({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });
    const lookupAfterInsert = makeChain({
      data: {
        id: 'uuid-from-other-request',
        customer_org_id: 'uuid-org',
        role: 'admin',
        email: 'newrep@demystified.ai',
      },
      error: null,
    });

    let usersCall = 0;
    (mockClient.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'users') {
        usersCall += 1;
        if (usersCall === 1) return lookupEmpty;
        if (usersCall === 2) return insertCollision;
        return lookupAfterInsert;
      }
      if (table === 'customer_orgs') return orgLookup;
      throw new Error(`unexpected table ${table}`);
    });

    const { bootstrapUserByEmail } = await import('@/lib/auth/user-bootstrap');
    const result = await bootstrapUserByEmail('newrep@demystified.ai', mockClient);

    expect(result).toEqual({
      id: 'uuid-from-other-request',
      orgId: 'uuid-org',
      role: 'admin',
      email: 'newrep@demystified.ai',
    });
  });

  it('returns null on empty email (defense, no DB read)', async () => {
    const { bootstrapUserByEmail } = await import('@/lib/auth/user-bootstrap');
    expect(await bootstrapUserByEmail('   ', mockClient)).toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });
});
