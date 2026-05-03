// /pathfinder/api/briefing/prefs — Demo Polish UX Gate 13W-C.
//
// GET — load briefing_prefs for the current operator (defaults if no
//       row exists).
// POST — upsert briefing_prefs (frequency, send_hour, timezone,
//        sections, paused).
//
// Auth: requires the basic-auth principal to be in OPERATOR_EMAILS via
// `getCurrentUserId`. Non-operators get 403.

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import { loadPrefs } from '@/services/briefer';
import { supabaseAdmin } from '@/lib/supabase';
import {
  DEFAULT_BRIEFING_PREFS,
  type BriefingFrequency,
  type BriefingSections,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const VALID_FREQUENCIES: BriefingFrequency[] = ['daily', 'weekly', 'paused'];

interface PostBody {
  frequency?: unknown;
  send_hour?: unknown;
  timezone?: unknown;
  sections?: unknown;
  paused?: unknown;
}

function sanitizeSections(input: unknown): BriefingSections {
  const defaults = DEFAULT_BRIEFING_PREFS.sections;
  if (!input || typeof input !== 'object') return { ...defaults };
  const o = input as Record<string, unknown>;
  return {
    new_leads: typeof o.new_leads === 'boolean' ? o.new_leads : defaults.new_leads,
    follow_ups: typeof o.follow_ups === 'boolean' ? o.follow_ups : defaults.follow_ups,
    stage_changes:
      typeof o.stage_changes === 'boolean' ? o.stage_changes : defaults.stage_changes,
    replies: typeof o.replies === 'boolean' ? o.replies : defaults.replies,
    contacts_pending:
      typeof o.contacts_pending === 'boolean'
        ? o.contacts_pending
        : defaults.contacts_pending,
  };
}

export async function GET(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const admin = supabaseAdmin() as unknown as {
      from: (t: string) => unknown;
    };
    const prefs = await loadPrefs(
      admin as { from: (t: string) => unknown } as Parameters<typeof loadPrefs>[0],
      userId,
    );
    return NextResponse.json({ prefs });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'load_failed', detail: reason }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const body = (raw ?? {}) as PostBody;

  const frequency =
    typeof body.frequency === 'string' &&
    (VALID_FREQUENCIES as string[]).includes(body.frequency)
      ? (body.frequency as BriefingFrequency)
      : DEFAULT_BRIEFING_PREFS.frequency;

  const sendHourRaw = Number(body.send_hour);
  const send_hour =
    Number.isFinite(sendHourRaw) && sendHourRaw >= 0 && sendHourRaw <= 23
      ? Math.floor(sendHourRaw)
      : DEFAULT_BRIEFING_PREFS.send_hour;

  const timezone =
    typeof body.timezone === 'string' && body.timezone.trim().length > 0
      ? body.timezone.trim()
      : DEFAULT_BRIEFING_PREFS.timezone;

  const sections = sanitizeSections(body.sections);
  const paused = typeof body.paused === 'boolean' ? body.paused : false;

  try {
    const admin = supabaseAdmin() as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => {
          select: (cols: string) => {
            single: () => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };
    const res = await admin
      .from('briefing_prefs')
      .upsert(
        {
          user_id: userId,
          frequency,
          send_hour,
          timezone,
          sections,
          paused,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    if (res.error) {
      return NextResponse.json(
        { error: 'upsert_failed', detail: res.error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ prefs: res.data });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'upsert_failed', detail: reason }, { status: 500 });
  }
}
