// GET /api/projects/[id]/timeline → TimelineEvent[]
//
// Stream B Gate B3 — collated activity timeline for a single lead.
// Anon-readable per existing RLS (the underlying tables are anon-read).

import { NextResponse } from 'next/server';

import { buildTimelineForProject } from '@/lib/timeline';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!params.id) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }
  try {
    const events = await buildTimelineForProject(params.id);
    return NextResponse.json(events);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
