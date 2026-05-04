// __tests__/api/scoring.test.ts — covers the two scoring HTTP endpoints that
// the Verifier Computer agent calls remotely (it can't import lib/scoring.ts
// because it lives outside the Next.js bundle).
//
// Tests invoke the route handlers directly via `POST(new Request(...))` to
// avoid spinning up a dev server. Endpoints under test:
//   POST /api/scoring/branch  — wraps nearestBranch(project, branches)
//   POST /api/scoring/score   — wraps scoreProject({project, branches, customers})

import { describe, expect, it } from 'vitest';
import { POST as branchPOST, GET as branchGET } from '@/app/api/scoring/branch/route';
import { POST as scorePOST, GET as scoreGET } from '@/app/api/scoring/score/route';

const HOU = { id: 'hou-002', lat: 29.7604, lon: -95.3698, coverage_radius_miles: 300 };
const PHX = { id: 'phx-001', lat: 33.4484, lon: -112.074, coverage_radius_miles: 300 };
const ATL = { id: 'atl-003', lat: 33.749, lon: -84.388, coverage_radius_miles: 300 };

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scoring/branch', () => {
  it('returns the nearest branch + distance + in_coverage for a Houston-area project', async () => {
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lat: 29.76, lon: -95.4 },
        branches: [HOU, PHX, ATL],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nearest_branch_id).toBe('hou-002');
    expect(body.distance_miles).toBeLessThan(10);
    expect(body.in_coverage).toBe(true);
  });

  it('flags a project outside coverage as in_coverage=false', async () => {
    // Middle of the Atlantic — way past 300mi from any of these branches.
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lat: 30, lon: -40 },
        branches: [HOU, PHX, ATL],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.in_coverage).toBe(false);
    expect(body.distance_miles).toBeGreaterThan(300);
  });

  it('defaults coverage_radius_miles to 300 when omitted', async () => {
    // Branch shipped without coverage radius — endpoint should still answer.
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lat: 29.76, lon: -95.4 },
        branches: [{ id: 'hou-002', lat: 29.7604, lon: -95.3698 }],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nearest_branch_id).toBe('hou-002');
    expect(body.in_coverage).toBe(true);
  });

  it('returns 400 when project.lat is missing', async () => {
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lon: -95.4 },
        branches: [HOU],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lat/);
  });

  it('returns 400 when project.lat is non-numeric', async () => {
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lat: 'thirty', lon: -95.4 },
        branches: [HOU],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when branches is empty', async () => {
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lat: 29.76, lon: -95.4 },
        branches: [],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/branches/);
  });

  it('returns 400 when a branch entry is malformed', async () => {
    const res = await branchPOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/branch', {
        project: { lat: 29.76, lon: -95.4 },
        branches: [{ id: 'hou-002', lat: 'no', lon: -95.3698 }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 405 on GET', async () => {
    const res = await branchGET();
    expect(res.status).toBe(405);
  });
});

describe('POST /api/scoring/score', () => {
  it('returns the full ScoringOutput for a high-priority Houston RFP', async () => {
    const res = await scorePOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/score', {
        project: {
          lat: 29.92,
          lon: -95.4,
          project_value: 4_200_000,
          project_stage: 'RFP',
        },
        branches: [HOU, PHX, ATL],
        customers: [
          { id: 'c-mh', lat: 29.92, lon: -95.42, served_by_branch_id: 'hou-002' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nearest_branch_id).toBe('hou-002');
    expect(body.in_coverage).toBe(true);
    expect(body.geo_score).toBe(100);
    expect(body.stage_score).toBe(90);
    expect(body.customer_score).toBe(100);
    expect(body.composite_score).toBeGreaterThanOrEqual(85);
    expect(body.warm_for_customer_id).toBeNull();
  });

  it('flags warm-intro when the closest customer is served by a different branch', async () => {
    const res = await scorePOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/score', {
        project: { lat: 33.46, lon: -112.08, project_value: 2_800_000, project_stage: 'RFP' },
        branches: [HOU, PHX, ATL],
        customers: [
          { id: 'c-cross', lat: 33.46, lon: -112.08, served_by_branch_id: 'hou-002' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nearest_branch_id).toBe('phx-001');
    expect(body.warm_for_customer_id).toBe('c-cross');
  });

  it('handles empty customers array', async () => {
    const res = await scorePOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/score', {
        project: { lat: 29.76, lon: -95.37, project_stage: 'PLN', project_value: null },
        branches: [HOU, PHX, ATL],
        customers: [],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Gate 17D: 0 miles → geo 100; PLN → 60; no customers → 0; composite = 68
    expect(body.geo_score).toBe(100);
    expect(body.stage_score).toBe(60);
    expect(body.customer_score).toBe(0);
    expect(body.composite_score).toBe(68);
    expect(body.warm_for_customer_id).toBeNull();
  });

  it('returns 400 when project.lat is missing', async () => {
    const res = await scorePOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/score', {
        project: { lon: -95.4, project_stage: 'RFP' },
        branches: [HOU],
        customers: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when branches is empty', async () => {
    const res = await scorePOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/score', {
        project: { lat: 29.76, lon: -95.4, project_stage: 'RFP' },
        branches: [],
        customers: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a branch is missing coverage_radius_miles', async () => {
    const res = await scorePOST(
      jsonRequest('http://localhost/pathfinder/api/scoring/score', {
        project: { lat: 29.76, lon: -95.4, project_stage: 'RFP' },
        branches: [{ id: 'hou-002', lat: 29.76, lon: -95.37 }],
        customers: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new Request('http://localhost/pathfinder/api/scoring/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await scorePOST(req);
    expect(res.status).toBe(400);
  });

  it('returns 405 on GET', async () => {
    const res = await scoreGET();
    expect(res.status).toBe(405);
  });
});
