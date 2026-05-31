// app/api/internal/chat/route.ts
//
// Stream H, Lead Chat Agent (Internal). POST runs the two-tool orchestrator
// (Claude with pathfinder_leads as PRIMARY tool and perplexity_research as
// SECONDARY) and streams the result back as Server-Sent Events. GET returns
// prior messages for a (org, company, thread) scope so the panel rehydrates
// on open and after reload.
//
// Persistence: every user, assistant, and tool turn lands in
// pathfinder.lead_chat_messages (migration 20260530_lead_chat_messages.sql).
// Scope keying is (org_id, company_id, thread_id, user_email).
//
// This route is Internal-only by design. It refuses anything where the
// looked-up organizations.slug is not 'internal' so the route cannot be
// pointed at Zedcor, Realberry, or Funder. The existing customer-facing
// Pathfinder chat at /api/chat continues to serve Zedcor untouched.
//
// Spec:  Pathfinder/docs/SPEC-Internal-Rework-V2.md § Stream H.
// Plans: Pathfinder/docs/PLAN-stream-h.md (v1) and
//        Pathfinder/docs/PLAN-stream-h-data-tool.md (this pass).

import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  appendLeadChatMessage,
  listLeadChatMessagesByThread,
  listLeadChatThreads,
} from '@/lib/chat/lead-chat-persist';
import { runInternalChatAgent } from '@/lib/chat/internal-chat-agent';
import type {
  LeadChatPostBody,
  LeadChatSseEvent,
} from '@/lib/chat/lead-chat-types';
import type { Organization, Project } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERNAL_SLUG = 'internal';

function userEmailFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    const user = decoded.slice(0, idx).trim();
    return user || null;
  } catch {
    return null;
  }
}

function sseChunk(payload: LeadChatSseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function loadInternalOrg(slug: string): Promise<Organization | null> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          maybeSingle: () => Promise<{ data: Organization | null; error: unknown }>;
        };
      };
    };
  };
  const res = await admin.from('organizations').select('*').eq('slug', slug).maybeSingle();
  return (res.data ?? null) as Organization | null;
}

async function loadCompany(id: string, orgId: string): Promise<Project | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  return (data ?? null) as Project | null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  let body: LeadChatPostBody;
  try {
    body = (await req.json()) as LeadChatPostBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!body.message || !body.thread_id || !body.org_slug || !body.scope_label) {
    return new Response(
      JSON.stringify({ error: 'org_slug_thread_id_message_scope_label_required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }
  if (body.org_slug !== INTERNAL_SLUG) {
    return new Response(JSON.stringify({ error: 'internal_only' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  const org = await loadInternalOrg(body.org_slug);
  if (!org) {
    return new Response(JSON.stringify({ error: 'org_not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const focalId = body.company_id ?? null;
  const focalProject = focalId ? await loadCompany(focalId, org.id) : null;
  if (focalId && !focalProject) {
    return new Response(JSON.stringify({ error: 'company_not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: LeadChatSseEvent) => controller.enqueue(sseChunk(e));
      const close = () => controller.close();
      try {
        // Persist the user turn before the agent runs so a network failure
        // mid-turn still leaves the question in history.
        await appendLeadChatMessage({
          orgId: org.id,
          companyId: focalId,
          threadId: body.thread_id,
          userEmail,
          role: 'user',
          content: body.message,
        });

        emit({ type: 'meta', threadId: body.thread_id, scopeLabel: body.scope_label });

        const history = await listLeadChatMessagesByThread({
          threadId: body.thread_id,
          userEmail,
          limit: 12,
        });
        const agentHistory = history
          .filter((h) => h.role === 'user' || h.role === 'assistant')
          .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));

        const focal = focalProject
          ? { id: focalProject.id, name: focalProject.title }
          : null;

        const result = await runInternalChatAgent({
          orgId: org.id,
          orgSlug: org.slug ?? INTERNAL_SLUG,
          orgName: org.name ?? 'Internal',
          scopeLabel: body.scope_label,
          focal,
          message: body.message,
          history: agentHistory,
          emit,
        });

        // Persist any tool turns first, so the assistant row appears last
        // in chronological order on rehydration.
        for (const call of result.toolCalls) {
          await appendLeadChatMessage({
            orgId: org.id,
            companyId: focalId,
            threadId: body.thread_id,
            userEmail,
            role: 'tool',
            kind: 'tool_result',
            content: call.resultSummary,
            payload: { input: call.input as Record<string, unknown> },
            toolName: call.name,
          });
        }

        if (result.stopped === 'error') {
          const fallback = `Chat is currently unavailable. ${result.errorMessage ?? 'unknown error'}`;
          if (result.text.length === 0) emit({ type: 'delta', text: fallback });
          await appendLeadChatMessage({
            orgId: org.id,
            companyId: focalId,
            threadId: body.thread_id,
            userEmail,
            role: 'assistant',
            kind: 'error',
            content: result.text.length > 0 ? result.text : fallback,
            payload: { reason: 'agent_error', detail: result.errorMessage ?? '' },
            modelUsed: result.modelUsed,
            latencyMs: result.latencyMs,
          });
          emit({ type: 'done', latencyMs: Date.now() - startedAt });
          close();
          return;
        }

        await appendLeadChatMessage({
          orgId: org.id,
          companyId: focalId,
          threadId: body.thread_id,
          userEmail,
          role: 'assistant',
          kind: 'text',
          content: result.text,
          payload: {
            classified_as: 'agent',
            tool_call_names: result.toolCalls.map((c) => c.name),
            stopped: result.stopped,
            // SPEC-Chat-Fixes.md defect 3: persist the projected
            // CompanyLeadView rows so the panel re-renders the inline
            // lead cards on rehydrate (GET /api/internal/chat).
            referenced_leads:
              result.referencedLeads.length > 0 ? result.referencedLeads : null,
          },
          sources: result.sources.length > 0 ? result.sources : null,
          modelUsed: result.modelUsed,
          latencyMs: result.latencyMs,
        });

        emit({ type: 'done', latencyMs: Date.now() - startedAt });
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: 'error', message });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get('org_slug');
  const companyIdParam = searchParams.get('company_id');
  const threadId = searchParams.get('thread_id');
  const listThreads = searchParams.get('list_threads');

  if (orgSlug !== INTERNAL_SLUG) {
    return new Response(JSON.stringify({ error: 'internal_only' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  const org = await loadInternalOrg(INTERNAL_SLUG);
  if (!org) {
    return new Response(JSON.stringify({ error: 'org_not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const companyId =
    companyIdParam === null || companyIdParam === '' ? null : companyIdParam;

  if (listThreads === '1') {
    const threads = await listLeadChatThreads({
      orgId: org.id,
      companyId,
      userEmail,
    });
    return new Response(JSON.stringify({ threads }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!threadId) {
    return new Response(JSON.stringify({ error: 'thread_id_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const messages = await listLeadChatMessagesByThread({
    threadId,
    userEmail,
  });

  return new Response(
    JSON.stringify({
      thread_id: threadId,
      messages,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}
