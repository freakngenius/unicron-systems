// app/api/internal/chat/route.ts
//
// Stream H, Lead Chat Agent (Internal). POST streams a Perplexity Sonar
// response grounded in the org's real Internal lead data, with the
// "researching" indicator before any delta and source citations folded in.
// GET returns prior messages for a (org, company, thread) scope so the
// panel rehydrates on open and after reload.
//
// Persists every user and assistant turn to pathfinder.lead_chat_messages
// (migration 20260530_lead_chat_messages.sql). Scope keying is
// (org_id, company_id, thread_id, user_email).
//
// This route is Internal-only by design. It refuses anything where the
// looked-up organizations.slug is not 'internal' so the route cannot be
// pointed at Zedcor, Realberry, or Funder. The existing customer-facing
// Pathfinder chat at /api/chat continues to serve Zedcor untouched.
//
// Spec:  Pathfinder/docs/SPEC-Internal-Rework-V2.md § Stream H.
// Plan:  Pathfinder/docs/PLAN-stream-h.md.

import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  isSonarConfigured,
  SONAR_UNCONFIGURED_MESSAGE,
  streamSonar,
  SonarRequestError,
} from '@/lib/chat/sonar';
import {
  buildLeadChatSystemPrompt,
  projectBundle,
} from '@/lib/chat/lead-chat-context';
import {
  appendLeadChatMessage,
  listLeadChatMessagesByThread,
  listLeadChatThreads,
} from '@/lib/chat/lead-chat-persist';
import type {
  LeadChatPostBody,
  LeadChatSseEvent,
} from '@/lib/chat/lead-chat-types';
import type { ChatSourceCitation, Organization, Project } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERNAL_SLUG = 'internal';
const FILTERED_LIST_CAP = 50;
const HISTORY_TURN_LIMIT = 12;

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

async function loadCompany(id: string): Promise<Project | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as Project | null;
}

async function loadCompanies(ids: string[]): Promise<Project[]> {
  if (ids.length === 0) return [];
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('projects')
    .select('*')
    .in('id', ids.slice(0, FILTERED_LIST_CAP));
  return ((data ?? []) as Project[]) ?? [];
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
  const focalProject = focalId ? await loadCompany(focalId) : null;
  if (focalId && !focalProject) {
    return new Response(JSON.stringify({ error: 'company_not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const listProjects = focalId
    ? []
    : await loadCompanies(body.filtered_company_ids ?? []);

  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: LeadChatSseEvent) => controller.enqueue(sseChunk(e));
      const close = () => controller.close();
      try {
        // Persist the user turn before streaming starts so a network
        // failure mid-stream still leaves the question in history.
        await appendLeadChatMessage({
          orgId: org.id,
          companyId: focalId,
          threadId: body.thread_id,
          userEmail,
          role: 'user',
          content: body.message,
        });

        emit({ type: 'meta', threadId: body.thread_id, scopeLabel: body.scope_label });

        if (!isSonarConfigured()) {
          emit({ type: 'delta', text: SONAR_UNCONFIGURED_MESSAGE });
          await appendLeadChatMessage({
            orgId: org.id,
            companyId: focalId,
            threadId: body.thread_id,
            userEmail,
            role: 'assistant',
            kind: 'text',
            content: SONAR_UNCONFIGURED_MESSAGE,
            payload: { degraded: true, reason: 'sonar_not_configured' },
          });
          emit({ type: 'done', latencyMs: Date.now() - startedAt });
          close();
          return;
        }

        const history = await listLeadChatMessagesByThread({
          threadId: body.thread_id,
          userEmail,
          limit: HISTORY_TURN_LIMIT,
        });

        const focal = focalProject ? { project: focalProject, ...projectBundle(focalProject) } : null;
        const list = listProjects.map((p) => projectBundle(p));

        const systemPrompt = buildLeadChatSystemPrompt({
          orgName: org.name,
          scopeLabel: body.scope_label,
          focal,
          list,
          history: history.map((h) => ({ role: h.role, content: h.content })),
        });

        // Signal the panel to render the "Researching with Perplexity"
        // chip before the first delta lands.
        emit({ type: 'researching', provider: 'perplexity-sonar' });

        let acc = '';
        let citations: ChatSourceCitation[] = [];
        try {
          for await (const ev of streamSonar({
            systemPrompt,
            query: body.message,
            recencyDays: 30,
          })) {
            if (ev.type === 'delta') {
              acc += ev.text;
              emit({ type: 'delta', text: ev.text });
            } else if (ev.type === 'citations') {
              citations = ev.items;
            }
          }
        } catch (err) {
          const fallback =
            err instanceof SonarRequestError
              ? `Sonar request failed (status ${err.status}). Try again, or rephrase.`
              : `Chat is currently unavailable. ${err instanceof Error ? err.message : String(err)}`;
          emit({ type: 'delta', text: fallback });
          await appendLeadChatMessage({
            orgId: org.id,
            companyId: focalId,
            threadId: body.thread_id,
            userEmail,
            role: 'assistant',
            kind: 'error',
            content: fallback,
            payload: { reason: 'sonar_error', detail: String(err) },
          });
          emit({ type: 'done', latencyMs: Date.now() - startedAt });
          close();
          return;
        }

        if (citations.length > 0) {
          emit({ type: 'sources', items: citations });
        }

        await appendLeadChatMessage({
          orgId: org.id,
          companyId: focalId,
          threadId: body.thread_id,
          userEmail,
          role: 'assistant',
          kind: 'text',
          content: acc.trim(),
          payload: { classified_as: 'sonar_default' },
          sources: citations.length > 0 ? citations : null,
          modelUsed: 'sonar',
          latencyMs: Date.now() - startedAt,
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
