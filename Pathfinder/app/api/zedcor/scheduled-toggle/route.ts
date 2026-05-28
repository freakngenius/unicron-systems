// app/api/zedcor/scheduled-toggle/route.ts
//
// Sprint Z1A — POST endpoint that flips the manual_only flag on the
// Zedcor org's config jsonb. Z1B's Scheduled toggle calls this; Z1A's
// cron-guard reads it.
//
// Body: { enabled: boolean }
//   enabled=true  → manual_only=false (cron is live again)
//   enabled=false → manual_only=true  (cron is muted; manual trigger only)

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ZEDCOR_ORG_ID } from '@/lib/orchestrator/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ToggleBody {
  enabled?: boolean;
}

interface OrgRow {
  id: string;
  config: Record<string, unknown> | null;
}

function operatorIdentity(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice('Basic '.length));
      const user = decoded.split(':')[0];
      if (user) return `${user}@basic-auth`;
    } catch {
      // fall through
    }
  }
  return process.env.BASIC_AUTH_USER ? `${process.env.BASIC_AUTH_USER}@basic-auth` : 'operator';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ToggleBody = {};
  try {
    body = (await req.json()) as ToggleBody;
  } catch {
    body = {};
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: '`enabled` (boolean) is required' }, { status: 400 });
  }
  const nextManualOnly = !body.enabled;

  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: OrgRow | null; error: { message: string } | null }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };

  const { data: orgRow, error: readErr } = await admin
    .from('organizations')
    .select('id, config')
    .eq('id', ZEDCOR_ORG_ID)
    .single();
  if (readErr || !orgRow) {
    return NextResponse.json({ error: `read failed: ${readErr?.message ?? 'no row'}` }, { status: 500 });
  }
  const prevManualOnly = Boolean((orgRow.config as { manual_only?: boolean } | null)?.manual_only);
  const newConfig = { ...(orgRow.config ?? {}), manual_only: nextManualOnly };

  const { error: updErr } = await admin
    .from('organizations')
    .update({ config: newConfig })
    .eq('id', ZEDCOR_ORG_ID);
  if (updErr) {
    return NextResponse.json({ error: `update failed: ${(updErr as Error).message}` }, { status: 500 });
  }

  const by = operatorIdentity(req);
  const ts = new Date().toISOString();
  await admin.from('agent_log').insert({
    agent_name: 'zedcor-scheduled-toggle',
    event_type: 'manual_only_toggle',
    event_data: { by, from: prevManualOnly, to: nextManualOnly },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts,
  });

  return NextResponse.json({ manual_only: nextManualOnly, by, ts });
}
