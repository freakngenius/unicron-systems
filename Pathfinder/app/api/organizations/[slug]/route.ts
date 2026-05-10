// app/api/organizations/[slug]/route.ts
// Spec: MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md
//
// GET   /api/organizations/:slug — fetch single org by slug
// PATCH /api/organizations/:slug — partial update: name and/or architecture
//
// Auth: x-unicron-api-key validated against UNICRON_INGEST_API_KEY.
// All DB ops use supabaseAdmin() (service role).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const METACRON_ORIGINS = [
  'https://unicron-platform.vercel.app',
  'https://metacron.unicron.systems',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (METACRON_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))
      ? origin
      : METACRON_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-unicron-api-key',
  };
}

function validateApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-unicron-api-key');
  const expected = process.env.UNICRON_INGEST_API_KEY;
  if (!expected) return false;
  return key === expected;
}

const PatchOrgSchema = z.object({
  name: z.string().min(1).optional(),
  architecture: z.record(z.unknown()).optional(),
});

type RouteContext = { params: Promise<{ slug: string }> };

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const origin = req.headers.get('origin');
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) });
  }

  const { slug } = await context.params;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders(origin) });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders(origin) });
  }

  return NextResponse.json(data as Organization, { headers: corsHeaders(origin) });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const origin = req.headers.get('origin');
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) });
  }

  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(origin) });
  }

  const parsed = PatchOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400, headers: corsHeaders(origin) });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminWrite = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data, error } = (await adminWrite
    .from('organizations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select()
    .maybeSingle()) as { data: Organization | null; error: { message: string } | null };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders(origin) });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders(origin) });
  }

  return NextResponse.json(data as Organization, { headers: corsHeaders(origin) });
}
