// __tests__/agents/loadOrgArchitecture.test.ts — Phase 2C slice 1.
// Spec: SPEC - Phase 2C Dynamic Agent Dispatch.md.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BASE_ARCHITECTURE } from '@/lib/config/baseTemplate';
import { loadOrgArchitecture, __setSupabaseClientForTests } from '@/lib/agents/loadOrgArchitecture';

interface MockOrgRow {
  id: string;
  name: string;
  slug: string;
  architecture: Record<string, unknown>;
}

function makeMockClient(rows: MockOrgRow[], error: { message: string } | null = null) {
  return {
    from(table: string) {
      if (table !== 'organizations') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select() {
          return {
            eq(_col: string, value: string) {
              return {
                async maybeSingle() {
                  const row = rows.find((r) => r.id === value) ?? null;
                  return { data: row, error };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('loadOrgArchitecture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns BASE_ARCHITECTURE merged with the org row architecture', async () => {
    __setSupabaseClientForTests(
      makeMockClient([
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Realberry',
          slug: 'realberry',
          architecture: {
            vertical: 'real-estate-investment',
            vocabulary: { lead: 'deal', leads: 'deals' },
            branding: { display_name: 'Realberry' },
          },
        },
      ]) as unknown as Parameters<typeof __setSupabaseClientForTests>[0],
    );

    const result = await loadOrgArchitecture('11111111-1111-1111-1111-111111111111');
    expect(result.org.name).toBe('Realberry');
    expect(result.org.slug).toBe('realberry');
    expect(result.architecture.vertical).toBe('real-estate-investment');
    expect(result.architecture.vocabulary.lead).toBe('deal');
    expect(result.architecture.branding.display_name).toBe('Realberry');
    // BASE fallback preserved
    expect(result.architecture.outreach.persona).toBe(BASE_ARCHITECTURE.outreach.persona);
  });

  it('returns BASE_ARCHITECTURE when org has architecture: {}', async () => {
    __setSupabaseClientForTests(
      makeMockClient([
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Zedcor',
          slug: 'zedcor',
          architecture: {},
        },
      ]) as unknown as Parameters<typeof __setSupabaseClientForTests>[0],
    );

    const result = await loadOrgArchitecture('22222222-2222-2222-2222-222222222222');
    expect(result.architecture).toEqual(BASE_ARCHITECTURE);
  });

  it('throws OrgNotFoundError for unknown org id', async () => {
    __setSupabaseClientForTests(
      makeMockClient([]) as unknown as Parameters<typeof __setSupabaseClientForTests>[0],
    );
    await expect(loadOrgArchitecture('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /not found/i,
    );
  });

  it('surfaces supabase errors verbatim', async () => {
    __setSupabaseClientForTests(
      makeMockClient([], { message: 'permission denied' }) as unknown as Parameters<
        typeof __setSupabaseClientForTests
      >[0],
    );
    await expect(loadOrgArchitecture('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      /permission denied/,
    );
  });
});
