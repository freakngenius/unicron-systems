// app/api/organizations/route.ts
// Spec: MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md
//
// GET  /api/organizations — list all orgs (operator-scoped)
// POST /api/organizations — create org { name, slug, customer_org_id, architecture }
//
// Auth: x-unicron-api-key header validated against UNICRON_INGEST_API_KEY.
// All DB ops use supabaseAdmin() (service role — bypasses RLS).
// CORS: allows Metacron Vercel origins for server-side proxy calls.

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-unicron-api-key',
  };
}

function validateApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-unicron-api-key');
  const expected = process.env.UNICRON_INGEST_API_KEY;
  if (!expected) return false;
  return key === expected;
}

const CreateOrgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  customer_org_id: z.string().min(1),
  architecture: z.record(z.unknown()).optional().default({}),
});

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders(origin) });
  }

  return NextResponse.json(data as Organization[], { headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(origin) });
  }

  const parsed = CreateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const { name, slug, customer_org_id, architecture } = parsed.data;

  const adminWrite = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data, error } = (await adminWrite
    .from('organizations')
    .insert({ name, slug, customer_org_id, architecture })
    .select()
    .single()) as { data: Organization | null; error: { message: string; code: string } | null };

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status, headers: corsHeaders(origin) });
  }

  return NextResponse.json(data as Organization, { status: 201, headers: corsHeaders(origin) });
}
