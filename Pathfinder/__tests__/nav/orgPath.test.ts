// __tests__/nav/orgPath.test.ts, Stream A Foundation.

import { describe, expect, it } from 'vitest';
import { buildOrgPath, orgPaths } from '@/lib/nav/orgPath';

describe('buildOrgPath', () => {
  it('returns /<slug> with no segments', () => {
    expect(buildOrgPath('internal')).toBe('/internal');
  });

  it('joins segments under /<slug>', () => {
    expect(buildOrgPath('internal', 'leads')).toBe('/internal/leads');
    expect(buildOrgPath('internal', 'leads', 'abc')).toBe('/internal/leads/abc');
  });

  it('URL-encodes segments with colons (propublica id pattern)', () => {
    expect(buildOrgPath('internal', 'leads', 'propublica:824334368')).toBe(
      '/internal/leads/propublica%3A824334368',
    );
  });

  it('leaves segments alone when raw: true', () => {
    expect(buildOrgPath('internal', 'leads', { segment: 'propublica:1', raw: true })).toBe(
      '/internal/leads/propublica:1',
    );
  });

  it('strips leading slashes from segments', () => {
    expect(buildOrgPath('internal', '/leads', '/abc')).toBe('/internal/leads/abc');
  });

  it('drops empty segments', () => {
    expect(buildOrgPath('internal', '', 'leads', '')).toBe('/internal/leads');
  });

  it('throws on empty slug', () => {
    expect(() => buildOrgPath('')).toThrow(/slug is required/);
    expect(() => buildOrgPath('   ')).toThrow(/slug is required/);
  });
});

describe('orgPaths shorthand', () => {
  it('dashboard / leads / leadDetail / pipeline produce the canonical paths', () => {
    expect(orgPaths.dashboard('internal')).toBe('/internal');
    expect(orgPaths.leads('internal')).toBe('/internal/leads');
    expect(orgPaths.leadDetail('internal', 'abc')).toBe('/internal/leads/abc');
    expect(orgPaths.pipeline('internal')).toBe('/internal/pipeline');
  });

  it('leadDetail encodes ids with colons', () => {
    expect(orgPaths.leadDetail('internal', 'propublica:1')).toBe(
      '/internal/leads/propublica%3A1',
    );
  });
});
