// POST /api/scoring/branch — wraps `nearestBranch()` from lib/scoring.ts so the
// Verifier Computer agent (running in a Perplexity Space, outside the Next.js
// bundle) can recompute branch attribution remotely during its 4-check pass.
//
// Body shape:
//   {
//     project: { lat: number, lon: number },
//     branches: [
//       { id: string, lat: number, lon: number, coverage_radius_miles?: number },
//       ...
//     ]
//   }
//
// Response shape:
//   { nearest_branch_id: string, distance_miles: number, in_coverage: boolean }
//
// Validation:
//   - 400 if project.lat/lon missing or non-numeric
//   - 400 if branches empty or any branch is missing lat/lon/id
//   - 405 on non-POST
//
// Auth: gated by the same Basic-auth middleware that protects the dashboard
// (zedcor/unicron). The Verifier sends the same `Authorization: Basic …` header.

import { NextResponse } from 'next/server';
import { nearestBranch } from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_COVERAGE_RADIUS_MILES = 300;

interface BranchInput {
  id: string;
  lat: number;
  lon: number;
  coverage_radius_miles?: number;
}

interface RequestBody {
  project?: { lat?: unknown; lon?: unknown } | null;
  branches?: unknown;
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

  const branches: BranchInput[] = [];
  for (let i = 0; i < rawBranches.length; i++) {
    const b = rawBranches[i] as Partial<BranchInput> | null | undefined;
    if (!b || typeof b.id !== 'string' || !isFiniteNumber(b.lat) || !isFiniteNumber(b.lon)) {
      return bad(`branches[${i}] requires id (string), lat (number), lon (number)`);
    }
    const coverage =
      isFiniteNumber(b.coverage_radius_miles) ? b.coverage_radius_miles : DEFAULT_COVERAGE_RADIUS_MILES;
    branches.push({ id: b.id, lat: b.lat, lon: b.lon, coverage_radius_miles: coverage });
  }

  const match = nearestBranch({ lat: project.lat, lon: project.lon }, branches);
  const chosen = branches.find((b) => b.id === match.branch_id)!;
  const coverage = chosen.coverage_radius_miles ?? DEFAULT_COVERAGE_RADIUS_MILES;
  const in_coverage = match.distance_miles < coverage;

  return NextResponse.json({
    nearest_branch_id: match.branch_id,
    distance_miles: match.distance_miles,
    in_coverage,
  });
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
