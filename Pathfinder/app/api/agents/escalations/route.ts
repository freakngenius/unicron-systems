// GET /api/agents/escalations → Project[]
//
// Returns projects the Verifier has escalated to a human (i.e. failed
// verification at least twice — `verifier_pass_count >= 2`). Ordered by
// `ranked_at` desc so the freshest escalations sit at the top of the
// EscalationPopover.
//
// The Verifier writes to a project on every check; `verifier_pass_count`
// climbs each time a re-check still finds the rationale / branch / score
// failing. Two strikes is the threshold per docs/PLAN-AGENTS.md — anything
// at or above that is the human's call.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ESCALATION_THRESHOLD = 2;

export async function GET() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .gte('verifier_pass_count', ESCALATION_THRESHOLD)
    .order('ranked_at', { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as Project[]);
}
