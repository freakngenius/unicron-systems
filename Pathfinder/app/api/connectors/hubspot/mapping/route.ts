// app/api/connectors/hubspot/mapping/route.ts — Demo Polish UX Gate 4B-2.
//
// GET / POST persistence for the HubSpot field + stage mapping. Stored
// under `pathfinder.connectors.metadata.hubspot_mapping` (jsonb).

import { NextResponse } from 'next/server';

import { DEFAULT_ORG_ID } from '@/lib/connectors/auth';
import {
  DEFAULT_HUBSPOT_MAPPING,
  parseMapping,
  validateMappingInput,
  type HubspotMappingConfig,
} from '@/lib/connectors/hubspot/mapping';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ConnectorRowSlim {
  id: string;
  metadata: Record<string, unknown> | null;
}

async function loadConnector(orgId: string): Promise<ConnectorRowSlim | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{
              data: ConnectorRowSlim | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .select('id, metadata')
    .eq('customer_org_id', orgId)
    .eq('connector_type', 'hubspot')
    .maybeSingle();
  if (res.error) {
    throw new Error(`failed to load HubSpot connector: ${res.error.message}`);
  }
  return res.data;
}

export async function GET(): Promise<NextResponse> {
  const connector = await loadConnector(DEFAULT_ORG_ID).catch(() => null);
  if (!connector) {
    return NextResponse.json({
      mapping: DEFAULT_HUBSPOT_MAPPING,
      connector_present: false,
    });
  }
  const stored = (connector.metadata ?? {})['hubspot_mapping'];
  const mapping = parseMapping(stored);
  return NextResponse.json({ mapping, connector_present: true, connector_id: connector.id });
}

interface UpdateBody {
  metadata: Record<string, unknown>;
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { mapping?: unknown } | null;
  if (!body || typeof body.mapping !== 'object' || body.mapping == null) {
    return NextResponse.json({ error: 'missing_mapping' }, { status: 400 });
  }
  const errors = validateMappingInput(body.mapping);
  if (errors.length > 0) {
    return NextResponse.json({ error: 'invalid_mapping', details: errors }, { status: 400 });
  }
  const next: HubspotMappingConfig = {
    ...parseMapping(body.mapping),
    updated_at: new Date().toISOString(),
  };

  const connector = await loadConnector(DEFAULT_ORG_ID);
  if (!connector) {
    return NextResponse.json({ error: 'no_connector' }, { status: 404 });
  }

  const newMetadata = {
    ...(connector.metadata ?? {}),
    hubspot_mapping: next,
  };

  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (v: UpdateBody) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const res = await sb.from('connectors').update({ metadata: newMetadata }).eq('id', connector.id);
  if (res.error) {
    return NextResponse.json({ error: 'persist_failed', detail: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mapping: next });
}
