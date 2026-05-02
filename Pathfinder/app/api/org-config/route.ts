// app/api/org-config/route.ts — Z-F finish: expose pathfinder.org_geo_config
// to client components so the lead-list distance threshold reads from the
// table instead of a hardcoded constant. Closes the P2 follow-up TODO.
//
// Read-only. No auth required (config values, not customer data).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

// Conservative spec defaults if the row is missing or the table doesn't exist.
const DEFAULT_MAX_SUPPORTED_DISTANCE_MILES = 250;
const DEFAULT_ALLOWED_COUNTRIES = ['USA', 'CAN'];

interface OrgGeoConfigResponse {
  org_id: string;
  max_supported_distance_miles: number;
  allowed_countries: string[];
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const orgId = url.searchParams.get('org') ?? 'zedcor';

  try {
    const admin = supabaseAdmin();
    // `org_geo_config` was added by the Demo Polish P1 migration (0104).
    // It's not in the generated Supabase Database types yet, so we untype
    // the client briefly to read the row, then cast through `unknown` to
    // a local shape.
    const untyped = admin as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await untyped
      .from('org_geo_config')
      .select('org_id, max_supported_distance_miles, allowed_countries')
      .eq('org_id', orgId)
      .maybeSingle();

    const row = (data as
      | {
          org_id?: string | null;
          max_supported_distance_miles?: number | string | null;
          allowed_countries?: string[] | null;
        }
      | null);

    if (error || !row) {
      const fallback: OrgGeoConfigResponse = {
        org_id: orgId,
        max_supported_distance_miles: DEFAULT_MAX_SUPPORTED_DISTANCE_MILES,
        allowed_countries: DEFAULT_ALLOWED_COUNTRIES,
      };
      return NextResponse.json(fallback, { status: 200 });
    }

    const body: OrgGeoConfigResponse = {
      org_id: row.org_id ?? orgId,
      max_supported_distance_miles:
        Number(row.max_supported_distance_miles) || DEFAULT_MAX_SUPPORTED_DISTANCE_MILES,
      allowed_countries:
        Array.isArray(row.allowed_countries) && row.allowed_countries.length > 0
          ? row.allowed_countries
          : DEFAULT_ALLOWED_COUNTRIES,
    };
    return NextResponse.json(body, { status: 200 });
  } catch {
    const fallback: OrgGeoConfigResponse = {
      org_id: orgId,
      max_supported_distance_miles: DEFAULT_MAX_SUPPORTED_DISTANCE_MILES,
      allowed_countries: DEFAULT_ALLOWED_COUNTRIES,
    };
    return NextResponse.json(fallback, { status: 200 });
  }
}
