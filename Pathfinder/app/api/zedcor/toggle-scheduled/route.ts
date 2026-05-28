// app/api/zedcor/toggle-scheduled/route.ts
// POST { enabled: boolean } — flips pathfinder.organizations.config.manual_only
// for the Zedcor org. enabled=true means scheduled crons are ON, so manual_only
// becomes false. Writes an audit row to pathfinder.agent_log.
//
// Hard-coded to the Zedcor organization_id to satisfy the auto-revert trigger
// "Toggle writes to the WRONG org's config".
//
// Sprint Z1A — replaces the earlier `scheduled-toggle/` path so it matches
// what Z1B's UI calls (POST /api/zedcor/toggle-scheduled).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOperatorIdentity, operatorDenied } from '@/lib/auth/require-operator';
import { ORCHESTRATOR_AGENT_NAME, ZEDCOR_ORG_ID } from '@/lib/orchestrator/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getOperatorIdentity();
  if (!auth.ok) return operatorDenied(auth);

  let body: { enabled?: unknown };
  try {
    body = (await req.json()) as { enabled?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'expected { enabled: boolean }' }, { status: 400 });
  }
  const nextScheduledEnabled = body.enabled;
  const nextManualOnly = !nextScheduledEnabled;
  const operatorEmail = auth.identity.email;

  // Read current config — for the audit trail.
  const readAdmin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { config: Record<string, unknown> | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const orgRes = await readAdmin
    .from('organizations')
    .select('config')
    .eq('id', ZEDCOR_ORG_ID)
    .maybeSingle();

  if (orgRes.error) {
    return NextResponse.json(
      { error: orgRes.error.message, code: 'org_read_failed' },
      { status: 503 },
    );
  }

  const prevConfig = (orgRes.data?.config ?? {}) as Record<string, unknown>;
  const prevManualOnly = (prevConfig.manual_only as boolean | undefined) ?? true;
  const nextConfig: Record<string, unknown> = { ...prevConfig, manual_only: nextManualOnly };

  // Hard-filter UPDATE by id = ZEDCOR_ORG_ID — defense against cross-tenant writes.
  const updateAdmin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const updateRes = await updateAdmin
    .from('organizations')
    .update({ config: nextConfig })
    .eq('id', ZEDCOR_ORG_ID);

  if (updateRes.error) {
    return NextResponse.json(
      { error: updateRes.error.message, code: 'org_update_failed' },
      { status: 503 },
    );
  }

  // Audit row.
  const logAdmin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  await logAdmin.from('agent_log').insert({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'manual_only_toggle',
    event_data: {
      by: operatorEmail,
      from: prevManualOnly,
      to: nextManualOnly,
      enabled: nextScheduledEnabled,
    },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
  });

  return NextResponse.json({
    manual_only: nextManualOnly,
    scheduled_enabled: nextScheduledEnabled,
  });
}
