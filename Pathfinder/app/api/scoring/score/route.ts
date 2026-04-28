// POST /api/scoring/score — wraps `scoreProject()` from lib/scoring.ts so the
// Verifier Computer agent can recompute the full composite score remotely
// during its 4-check pass. Returns the same `ScoringOutput` shape the Ranker
// emits when it writes to `pathfinder.projects` — the Verifier compares the
// two and flags any divergence as a verification failure.
//
// Body shape:
//   {
//     project: { lat, lon, project_value, project_stage },
//     branches: [{ id, lat, lon, coverage_radius_miles }, ...],
//     customers: [{ id, lat, lon, served_by_branch_id }, ...]   // may be empty
//   }
//
// Response shape: full `ScoringOutput` from `@/lib/scoring`:
//   { nearest_branch_id, distance_miles, in_coverage, warm_for_customer_id,
//     geo_score, stage_score, customer_score, composite_score }
//
// Validation:
//   - 400 if project.lat/lon missing or non-numeric
//   - 400 if branches empty or any branch missing required fields
//   - 400 if any customer is missing required fields
//   - 405 on non-POST
//
// Auth: gated by the same Basic-auth middleware that protects the dashboard.

import { NextResponse } from 'next/server';
import { scoreProject, type ScoringInput } from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RequestBody {
  project?: {
    lat?: unknown;
    lon?: unknown;
    project_value?: unknown;
    project_stage?: unknown;
  } | null;
  branches?: unknown;
  customers?: unknown;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return bad('invalid JSON body');
  }

  const project = body?.project;
  if (!project || !isFiniteNumber(project.lat) || !isFiniteNumber(project.lon)) {
    return bad('project.lat and project.lon must be finite numbers');
  }

  const rawBranches = body?.branches;
  if (!Array.isArray(rawBranches) || rawBranches.length === 0) {
    return bad('branches must be a non-empty array');
  }

  const branches: ScoringInput['branches'] = [];
  for (let i = 0; i < rawBranches.length; i++) {
    const b = rawBranches[i] as
      | { id?: unknown; lat?: unknown; lon?: unknown; coverage_radius_miles?: unknown }
      | null
      | undefined;
    if (
      !b ||
      typeof b.id !== 'string' ||
      !isFiniteNumber(b.lat) ||
      !isFiniteNumber(b.lon) ||
      !isFiniteNumber(b.coverage_radius_miles)
    ) {
      return bad(
        `branches[${i}] requires id (string), lat (number), lon (number), coverage_radius_miles (number)`,
      );
    }
    branches.push({
      id: b.id,
      lat: b.lat,
      lon: b.lon,
      coverage_radius_miles: b.coverage_radius_miles,
    });
  }

  const rawCustomers = body?.customers;
  const customers: ScoringInput['customers'] = [];
  if (rawCustomers !== undefined && rawCustomers !== null) {
    if (!Array.isArray(rawCustomers)) {
      return bad('customers must be an array (may be empty)');
    }
    for (let i = 0; i < rawCustomers.length; i++) {
      const c = rawCustomers[i] as
        | { id?: unknown; lat?: unknown; lon?: unknown; served_by_branch_id?: unknown }
        | null
        | undefined;
      if (!c || typeof c.id !== 'string' || !isFiniteNumber(c.lat) || !isFiniteNumber(c.lon)) {
        return bad(`customers[${i}] requires id (string), lat (number), lon (number)`);
      }
      const served =
        c.served_by_branch_id === null || typeof c.served_by_branch_id === 'string'
          ? c.served_by_branch_id
          : null;
      customers.push({ id: c.id, lat: c.lat, lon: c.lon, served_by_branch_id: served });
    }
  }

  const stage =
    typeof project.project_stage === 'string'
      ? project.project_stage
      : project.project_stage == null
        ? null
        : String(project.project_stage);
  const value =
    typeof project.project_value === 'number' && Number.isFinite(project.project_value)
      ? project.project_value
      : project.project_value == null
        ? null
        : null;

  try {
    const out = scoreProject({
      project: {
        lat: project.lat,
        lon: project.lon,
        project_value: value,
        project_stage: stage,
      },
      branches,
      customers,
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'scoring failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
