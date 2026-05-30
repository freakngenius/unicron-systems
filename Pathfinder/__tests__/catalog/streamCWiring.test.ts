// __tests__/catalog/streamCWiring.test.ts, Stream C Detail surface.
//
// Wiring regressions:
//   1. The four Stream C floor-stub loaders resolve to real components
//      whose displayName is NOT the Stream A "FloorStub(<id>)" pattern.
//   2. The seven Stream A loaders not yet wired by Stream C still resolve
//      to Stream A's FloorStub markers.
//   3. The catalog registry no longer carries score_components as a
//      dependency on company-detail (per SPEC SCORE-COMPONENTS NOTE).
//   4. The Zedcor lead-detail surface does not transitively import any
//      Stream C module (regression boundary: byte-unchanged for Zedcor).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FLOOR_STUB_LOADERS } from '@/lib/catalog/floor-stubs';
import { MODULE_REGISTRY } from '@/lib/catalog/registry';

const STREAM_C_IDS = ['company-detail', 'outreach-composer', 'hubspot-sync', 'warm-intro-panel'] as const;
// All other wired module ids (Stream B + Stream D) after they merged ahead
// of Stream C. Stream C tests assert these no longer resolve to floor stubs.
const STREAM_B_D_WIRED_IDS = [
  'ranked-feed',
  'filter-rail',
  'kpi-strip',
  'analytics-charts',
  'pipeline-kanban',
  'daily-digest',
] as const;
// The last remaining floor stub. No org enables geo-map (Stream A).
const STREAM_A_STUB_IDS = ['geo-map'] as const;

describe('Stream C floor-stub wiring', () => {
  it.each(STREAM_C_IDS)('loads a real component for %s', async (id) => {
    const loader = FLOOR_STUB_LOADERS[id];
    const mod = await loader();
    const def = mod.default as { displayName?: string; name?: string };
    const name = def.displayName ?? def.name ?? '';
    expect(name).not.toMatch(/^FloorStub\(/);
    // Defensive: the real components export the matching default. Names
    // can be minified in production; this assertion is intentionally
    // a negative check on the stub marker.
  });

  it.each(STREAM_B_D_WIRED_IDS)('loads a real component for %s (Stream B/D)', async (id) => {
    const loader = FLOOR_STUB_LOADERS[id];
    const mod = await loader();
    const def = mod.default as { displayName?: string; name?: string };
    const name = def.displayName ?? def.name ?? '';
    expect(name).not.toMatch(/^FloorStub\(/);
  });

  it.each(STREAM_A_STUB_IDS)('still resolves to a FloorStub marker for %s', async (id) => {
    const loader = FLOOR_STUB_LOADERS[id];
    const mod = await loader();
    const def = mod.default as { displayName?: string; name?: string };
    const name = def.displayName ?? def.name ?? '';
    expect(name).toMatch(new RegExp(`^FloorStub\\(${id}\\)$`));
  });
});

describe('catalog registry per SPEC SCORE-COMPONENTS NOTE', () => {
  it('company-detail does NOT carry score_components as a dependency', () => {
    const def = MODULE_REGISTRY['company-detail'];
    const refs = def.dependencies.map((d) => d.ref);
    expect(refs).not.toContain('score_components');
  });

  it('company-detail still carries enriched_record (hard) and sources (soft)', () => {
    const def = MODULE_REGISTRY['company-detail'];
    const enriched = def.dependencies.find((d) => d.ref === 'enriched_record');
    const sources = def.dependencies.find((d) => d.ref === 'sources');
    expect(enriched?.gate).toBe('hard');
    expect(sources?.gate).toBe('soft');
  });

  it('hubspot-sync stays as slotMode action-affordance', () => {
    const def = MODULE_REGISTRY['hubspot-sync'];
    expect(def.slotMode).toBe('action-affordance');
    expect(def.slot).toBe('detail.outreach');
  });
});

describe('Zedcor lead-detail regression boundary', () => {
  // Cheap text scan over the Zedcor / legacy detail files for any import
  // referencing Stream C module paths. The Zedcor surface (Funder routing
  // too) must stay byte-identical; a Stream C import would silently
  // change its behavior.
  const REPO_ROOT = join(__dirname, '..', '..');
  const FORBIDDEN_PATHS = [
    '@/components/catalog/modules/CompanyDetail',
    '@/components/catalog/modules/OutreachComposer',
    '@/components/catalog/modules/HubspotSync',
    '@/components/catalog/modules/WarmIntroPanel',
    '@/components/catalog/CatalogDetailRenderer',
    '@/components/catalog/CompanyDetailContext',
    '@/lib/catalog/internalSignals',
  ];

  it.each([
    'components/lead/LeadDetail.tsx',
    'components/lead/CompanyDetailContents.tsx',
    'components/lead/FunderDetailContents.tsx',
    'components/lead/LeadDetailShell.tsx',
    'app/leads/[projectId]/page.tsx',
  ])('does not import any Stream C module in %s', (relPath) => {
    const full = join(REPO_ROOT, relPath);
    const src = readFileSync(full, 'utf8');
    for (const forbidden of FORBIDDEN_PATHS) {
      expect(src).not.toContain(forbidden);
    }
  });
});
