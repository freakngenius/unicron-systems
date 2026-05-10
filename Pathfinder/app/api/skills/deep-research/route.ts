// app/api/skills/deep-research/route.ts — Sprint 5 Stream C
//
// POST /api/skills/deep-research
//
// Triggers a 4-pass autoresearch run for a given topic and writes output
// to vault/Memory/wiki/research/<slug>/ (brief.md, sources.md, meta.json).
//
// Auth:
//   1. x-api-key header matched against nervous_system.team_members config->>'ingest_api_key'
//      via the same RPC used by /api/ingest.
//   2. Falls back to UNICRON_INGEST_API_KEY shared env var (backward compat).
//   3. Session cookie accepted for browser-side Atrium calls (not yet implemented;
//      stub returns 401 if session auth needed in future).
//   4. Neither → 401.
//
// Body: { topic: string, slug?: string, target_pages?: number }
// Returns: DeepResearchResult
// Audit log: nervous_system.audit_log action='deep_research_run'

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deepResearch, type DeepResearchResult } from '@/lib/skills/deep-research';

// ─── Request schema ────────────────────────────────────────────────────────────

const requestSchema = z.object({
  topic: z.string().min(3, 'topic must be at least 3 characters').max(500),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be kebab-case').max(80).optional(),
  target_pages: z.number().int().min(8).max(15).optional(),
});

type RequestBody = z.infer<typeof requestSchema>;

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function auditLog(
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[skills/deep-research] audit_log skipped — missing Supabase env vars');
    return;
  }
  try {
    await fetch(`${url}/rest/v1/audit_log?schema=nervous_system`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Accept-Profile': 'nervous_system',
        'Content-Profile': 'nervous_system',
      },
      body: JSON.stringify({
        table_name: 'skills',
        action,
        actor_id: '9696088f-b3c5-4536-a4c6-c7a40312ad6b', // system actor
        payload: { ...metadata, _written_by: 'api/skills/deep-research route.ts' },
      }),
    });
  } catch (err) {
    console.error('[skills/deep-research] audit_log write failed (best-effort)', err);
  }
}

// ─── Team member API key lookup (same pattern as /api/ingest) ─────────────────

interface TeamMemberKeyMatch {
  id: string;
  name: string;
}

async function lookupTeamMemberByKey(apiKey: string): Promise<TeamMemberKeyMatch | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  try {
    // Use RPC for team_member key lookup — bypasses PostgREST schema exposure.
    // Matches the pattern established in fix/ingest-team-member-lookup-rpc.
    const res = await fetch(`${url}/rest/v1/rpc/lookup_team_member_by_ingest_key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Accept-Profile': 'nervous_system',
        'Content-Profile': 'nervous_system',
      },
      body: JSON.stringify({ p_api_key: apiKey }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as TeamMemberKeyMatch[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[skills/deep-research] team_member key lookup failed (best-effort)', err);
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamMember = await lookupTeamMemberByKey(apiKey);
  if (!teamMember) {
    // Fall back to shared env var
    if (apiKey !== process.env.UNICRON_INGEST_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { topic, slug, target_pages }: RequestBody = parsed.data;

  // ── Audit: run started ─────────────────────────────────────────────────────
  await auditLog('deep_research_run', {
    topic,
    slug: slug ?? null,
    target_pages: target_pages ?? 10,
    requested_by_team_member: teamMember?.id ?? 'shared-key',
  });

  // ── Execute deep-research skill ────────────────────────────────────────────
  let result: DeepResearchResult;
  try {
    result = await deepResearch({ topic, slug, target_pages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[skills/deep-research] deepResearch threw', { topic, err: msg });
    await auditLog('deep_research_error', { topic, slug: slug ?? null, error: msg });
    return NextResponse.json({ error: 'Deep research failed', detail: msg }, { status: 500 });
  }

  // ── Audit: run complete ────────────────────────────────────────────────────
  await auditLog('deep_research_complete', {
    topic,
    slug: result.slug,
    section_count: result.section_count,
    word_count: result.word_count,
    status: result.status,
    brief_path: result.brief_path,
  });

  // ── Return result ──────────────────────────────────────────────────────────
  const httpStatus = result.status === 'error' ? 500 : 200;
  return NextResponse.json(result, { status: httpStatus });
}
