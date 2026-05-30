// lib/chat/lead-chat-persist.ts
//
// Thin Supabase wrappers around pathfinder.lead_chat_messages. Used by the
// Internal Lead Chat Agent API route and the tests. Kept narrow on purpose:
// the route owns input validation, prompt construction, and SSE; this file
// owns row shape and the schema's typing quirks.

import { supabaseAdmin } from '@/lib/supabase';
import type { ChatSourceCitation } from '@/lib/types';
import type { LeadChatMessageRow, LeadChatRole } from './lead-chat-types';

interface AppendArgs {
  orgId: string;
  companyId: string | null;
  threadId: string;
  userEmail: string;
  role: LeadChatRole;
  kind?: string;
  content: string;
  payload?: Record<string, unknown>;
  sources?: ChatSourceCitation[] | null;
  toolName?: string | null;
  modelUsed?: string | null;
  latencyMs?: number | null;
}

// Supabase 2.45 strict typing requires a cast wrapper for inserts into
// tables added after the typed bag was generated. Mirrors the pattern in
// app/api/chat/route.ts and app/api/refresh/route.ts.
type InsertOneResult<T> = { data: T | null; error: { message: string } | null };
interface InsertOne<TPayload, TRow> {
  insert: (row: TPayload) => {
    select: (cols: string) => {
      single: () => Promise<InsertOneResult<TRow>>;
    };
  };
}

export async function appendLeadChatMessage(args: AppendArgs): Promise<LeadChatMessageRow> {
  const admin = supabaseAdmin();
  const row = {
    org_id: args.orgId,
    company_id: args.companyId,
    thread_id: args.threadId,
    user_email: args.userEmail,
    role: args.role,
    kind: args.kind ?? 'text',
    content: args.content,
    payload: args.payload ?? {},
    sources: args.sources ?? null,
    tool_name: args.toolName ?? null,
    model_used: args.modelUsed ?? null,
    latency_ms: args.latencyMs ?? null,
  };
  const { data, error } = await (
    admin.from('lead_chat_messages') as unknown as InsertOne<typeof row, LeadChatMessageRow>
  )
    .insert(row)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`failed to append lead_chat_messages row: ${error?.message ?? 'unknown'}`);
  }
  return data;
}

export interface ListByThreadArgs {
  threadId: string;
  userEmail: string;
  limit?: number;
}

export async function listLeadChatMessagesByThread(
  args: ListByThreadArgs,
): Promise<LeadChatMessageRow[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('lead_chat_messages')
    .select('*')
    .eq('thread_id', args.threadId)
    .eq('user_email', args.userEmail)
    .is('cleared_at', null)
    .order('created_at', { ascending: true })
    .limit(args.limit ?? 100);
  return ((data ?? []) as unknown as LeadChatMessageRow[]) ?? [];
}

export interface ListThreadsArgs {
  orgId: string;
  companyId: string | null;
  userEmail: string;
  limit?: number;
}

export interface ThreadSummary {
  thread_id: string;
  last_at: string;
  preview: string;
}

export async function listLeadChatThreads(args: ListThreadsArgs): Promise<ThreadSummary[]> {
  const admin = supabaseAdmin();
  let q = admin
    .from('lead_chat_messages')
    .select('thread_id, created_at, content, role')
    .eq('org_id', args.orgId)
    .eq('user_email', args.userEmail)
    .is('cleared_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  q = args.companyId === null ? q.is('company_id', null) : q.eq('company_id', args.companyId);
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    thread_id: string;
    created_at: string;
    content: string;
    role: string;
  }>;
  const seen = new Map<string, ThreadSummary>();
  for (const r of rows) {
    if (seen.has(r.thread_id)) continue;
    seen.set(r.thread_id, {
      thread_id: r.thread_id,
      last_at: r.created_at,
      preview: r.content.slice(0, 120),
    });
    if (seen.size >= (args.limit ?? 20)) break;
  }
  return Array.from(seen.values());
}
