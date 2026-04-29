// app/api/chat/route.ts — Intelligence Chat backend.
//
// POST  /api/chat       — accepts a user turn, classifies it, dispatches to
//                         one of five paths, streams the assistant response
//                         back via Server-Sent Events. Persists both the
//                         user message and the assistant message to
//                         pathfinder.chat_{threads,messages}.
//
// GET   /api/chat       — returns the thread for a given contextKey, with
//                         view-aware fallback (Q3 surfacing rule). Used by
//                         the chat panel on first open and on context
//                         change.
//
// Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 1 — Intelligence Chat".
// Plan: docs/PLAN-P0-01-INTELLIGENCE-CHAT.md.

import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { anthropic } from '@/lib/anthropic';
import {
  isSonarConfigured,
  SONAR_UNCONFIGURED_MESSAGE,
  streamSonar,
  SonarRequestError,
} from '@/lib/chat/sonar';
import {
  draftOutreach,
  type IterationIntent,
} from '@/lib/chat/outreach-drafter';
import type {
  Branch,
  ChatContextSnapshot,
  ChatMessage,
  ChatMessageKind,
  ChatMessageRole,
  ChatSourceCitation,
  ChatThread,
  Customer,
  Project,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAT_MODEL = process.env.PF_CHAT_MODEL ?? 'claude-sonnet-4-6';
const CLASSIFIER_MODEL = process.env.PF_CHAT_CLASSIFIER_MODEL ?? 'claude-sonnet-4-6';
const SUMMARY_MODEL = process.env.PF_CHAT_SUMMARY_MODEL ?? 'claude-sonnet-4-6';
const HISTORY_TURN_LIMIT = 12; // last 6 user/assistant pairs
const MESSAGES_GET_LIMIT = 50;

// ── User identity (from Basic-Auth) ────────────────────────────────────────

function userEmailFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    // atob is available in Node 18+ runtime.
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    const user = decoded.slice(0, idx).trim();
    return user || null;
  } catch {
    return null;
  }
}

// ── SSE helpers ────────────────────────────────────────────────────────────

type SseEvent =
  | { type: 'meta'; threadId: string; kind: ResponseKind }
  | { type: 'delta'; text: string }
  | { type: 'sources'; items: ChatSourceCitation[]; tables?: string[] }
  | { type: 'actions'; items: { id: string; label: string }[] }
  | { type: 'outreach'; bundle: unknown }
  | { type: 'done'; latencyMs: number }
  | { type: 'error'; message: string };

function sseChunk(payload: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ── Classifier ─────────────────────────────────────────────────────────────

type ResponseKind =
  | 'read_only_internal'
  | 'web_research'
  | 'outreach_draft'
  | 'workflow_action'
  | 'forecast_or_summary'
  | 'sonar_unconfigured';

interface Classification {
  kind: Exclude<ResponseKind, 'sonar_unconfigured'>;
  outreachIntent?: IterationIntent;
  audienceOverride?: string;
  needsSonar: boolean;
  reasoning: string;
}

const CLASSIFIER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'read_only_internal',
    description:
      'Use when the user is asking about projects, branches, customers, or pipeline data already present in pathfinder.* tables. No web research needed. Examples: "tell me more about this prime contractor" (when project context provides it), "show me TX leads with score over 80", "which branches have the highest unverified queue".',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
      },
      required: ['reasoning'],
    },
  },
  {
    name: 'web_research',
    description:
      'Use when answering requires current web information — recent news, contractor history, public expansion announcements, etc. Examples: "what other projects has this prime contractor led in the past 12 months", "pull the latest news on this project", "has this customer signaled expansion plans publicly".',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
      },
      required: ['reasoning'],
    },
  },
  {
    name: 'outreach_draft',
    description:
      'Use when the user is asking to draft, iterate on, or modify outreach (email + LinkedIn + voicemail). Returns a 3-channel bundle. Examples: "draft outreach for this lead", "make it tighter", "less salesy", "add the warm intro path", "open with a question", "rewrite for the VP of Facilities". Pick the right intent.',
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: [
            'fresh',
            'tighten',
            'less_salesy',
            'add_warm_intro',
            'open_with_question',
            'add_time_slot',
            'audience_pivot',
          ],
        },
        audience_override: { type: 'string' },
        reasoning: { type: 'string' },
      },
      required: ['intent', 'reasoning'],
    },
  },
  {
    name: 'workflow_action',
    description:
      'Use when the user is asking the system to take an action — accept a lead, push to HubSpot, schedule a follow-up, export CSV, summarize this week. The route returns action buttons / triggers without a full response.',
    input_schema: {
      type: 'object',
      properties: {
        action_id: {
          type: 'string',
          enum: [
            'copy_draft',
            'save_draft',
            'regenerate_draft',
            'export_csv',
            'summarize_pipeline',
            'accept_lead_to_hubspot',
            'push_to_pipeline',
            'schedule_followup',
            'add_note',
          ],
        },
        reasoning: { type: 'string' },
      },
      required: ['action_id', 'reasoning'],
    },
  },
  {
    name: 'forecast_or_summary',
    description:
      'Use for forecasting, summarization, or comparison questions answered from internal data plus narration. Examples: "what does next quarter pipeline look like", "generate the Friday brief now", "compare this branch performance to the rest of the network".',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
      },
      required: ['reasoning'],
    },
  },
];

async function classify(
  client: Anthropic,
  message: string,
  snapshot: ChatContextSnapshot,
): Promise<Classification> {
  const res = await client.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 256,
    tools: CLASSIFIER_TOOLS,
    tool_choice: { type: 'any' },
    system:
      'You route Pathfinder Intelligence Chat user turns to one of five backend paths. Pick exactly one tool. The user message and the dashboard context snapshot are provided.',
    messages: [
      {
        role: 'user',
        content: `CONTEXT SNAPSHOT:\n${JSON.stringify(snapshot)}\n\nUSER MESSAGE:\n${message}`,
      },
    ],
  });
  const tool = res.content.find((b) => b.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') {
    return { kind: 'read_only_internal', needsSonar: false, reasoning: 'classifier_fallback' };
  }
  const input = tool.input as Record<string, unknown>;
  const reasoning = String(input.reasoning ?? '');
  switch (tool.name) {
    case 'web_research':
      return { kind: 'web_research', needsSonar: true, reasoning };
    case 'outreach_draft':
      return {
        kind: 'outreach_draft',
        outreachIntent: (input.intent as IterationIntent) ?? 'fresh',
        audienceOverride: input.audience_override as string | undefined,
        needsSonar: false,
        reasoning,
      };
    case 'workflow_action':
      return { kind: 'workflow_action', needsSonar: false, reasoning };
    case 'forecast_or_summary':
      return { kind: 'forecast_or_summary', needsSonar: false, reasoning };
    case 'read_only_internal':
    default:
      return { kind: 'read_only_internal', needsSonar: false, reasoning };
  }
}

// ── Thread / message persistence ──────────────────────────────────────────

// Supabase 2.45 strict-typing requires cast wrappers for inserts on
// schemas added after the typed bag was first generated. Mirrors the
// pattern in app/api/refresh/route.ts and app/api/rationale/[projectId]/route.ts.
type InsertOneResult<T> = { data: T | null; error: { message: string } | null };
interface InsertOne<TPayload, TRow> {
  insert: (row: TPayload) => {
    select: (cols: string) => {
      single: () => Promise<InsertOneResult<TRow>>;
      maybeSingle: () => Promise<InsertOneResult<TRow>>;
    };
  };
}

async function getOrCreateThread(args: {
  userEmail: string;
  contextKey: string;
  contextLabel: string;
  snapshot: ChatContextSnapshot;
}): Promise<ChatThread> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from('chat_threads')
    .select('*')
    .eq('user_email', args.userEmail)
    .eq('context_key', args.contextKey)
    .maybeSingle();
  if (existing) return existing as ChatThread;

  const payload = {
    user_email: args.userEmail,
    context_key: args.contextKey,
    context_label: args.contextLabel,
    context_snapshot: args.snapshot as unknown as Record<string, unknown>,
  };
  const { data, error } = await (
    admin.from('chat_threads') as unknown as InsertOne<typeof payload, ChatThread>
  )
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) throw new Error(`failed to create chat thread: ${error?.message ?? 'unknown'}`);
  return data;
}

async function appendMessage(args: {
  threadId: string;
  role: ChatMessageRole;
  kind?: ChatMessageKind;
  content: string;
  payload?: Record<string, unknown>;
  modelUsed?: string | null;
  latencyMs?: number | null;
}): Promise<ChatMessage> {
  const admin = supabaseAdmin();
  const row = {
    thread_id: args.threadId,
    role: args.role,
    kind: args.kind ?? 'text',
    content: args.content,
    payload: args.payload ?? {},
    model_used: args.modelUsed ?? null,
    latency_ms: args.latencyMs ?? null,
  };
  const { data, error } = await (
    admin.from('chat_messages') as unknown as InsertOne<typeof row, ChatMessage>
  )
    .insert(row)
    .select('*')
    .single();
  if (error || !data) throw new Error(`failed to append chat message: ${error?.message ?? 'unknown'}`);
  return data;
}

async function loadHistory(threadId: string, limit: number): Promise<ChatMessage[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  // Reverse so oldest-first for prompt construction.
  return ((data ?? []) as ChatMessage[]).slice().reverse();
}

// ── Hydration: rehydrate context from snapshot IDs ────────────────────────

interface Hydrated {
  project: Project | null;
  branch: Branch | null;
  warmCustomer: Customer | null;
  filteredProjects: Project[];
  allBranches: Branch[];
}

async function hydrateContext(snapshot: ChatContextSnapshot): Promise<Hydrated> {
  const admin = supabaseAdmin();
  const projectId = snapshot.openProjectId;
  const branchId = snapshot.selectedBranchId;
  const filteredIds = snapshot.filteredProjectIds.slice(0, 50);

  const [projectRes, branchRes, branchesRes, projectsRes] = await Promise.all([
    projectId
      ? admin.from('projects').select('*').eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    branchId
      ? admin.from('branches').select('*').eq('id', branchId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from('branches').select('*'),
    filteredIds.length > 0
      ? admin.from('projects').select('*').in('id', filteredIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const project = (projectRes.data ?? null) as Project | null;
  const branch = (branchRes.data ?? null) as Branch | null;
  const allBranches = ((branchesRes.data ?? []) as Branch[]) ?? [];
  const filteredProjects = ((projectsRes.data ?? []) as Project[]) ?? [];

  let warmCustomer: Customer | null = null;
  if (project?.warm_for_customer_id) {
    const { data } = await admin
      .from('customers')
      .select('*')
      .eq('id', project.warm_for_customer_id)
      .maybeSingle();
    warmCustomer = (data ?? null) as Customer | null;
  }

  return { project, branch, warmCustomer, filteredProjects, allBranches };
}

// ── Internal-only response (read_only / forecast) ─────────────────────────

function buildInternalSystemPrompt(): string {
  return `You are Pathfinder's Intelligence Chat. You answer questions about Zedcor Security Systems' lead intelligence using only the structured data provided in the user message. Be specific, restrained, and direct.

Style rules — non-negotiable:
- No em-dashes (—) or en-dashes (–). Use commas, periods, or "to" instead.
- No buzzwords ("synergy", "leverage", "cutting-edge").
- When you reference a project, branch, or customer, name it specifically.
- When you don't have data to answer, say so plainly. Never fabricate.

When summarizing or comparing branches, prefer concrete numbers (counts, scores, dates) over qualitative language. When a query asks for a list, return a compact markdown list with project IDs in backticks so the dashboard can link them.

Provenance: at the end of your response, on a new line, write "TABLES:" followed by a comma-separated list of pathfinder.* tables you reasoned over (e.g., "TABLES: projects, branches"). The host strips this line for display and surfaces it as a structured provenance footer.`;
}

function buildInternalUserPayload(args: {
  userMessage: string;
  snapshot: ChatContextSnapshot;
  hydrated: Hydrated;
  history: ChatMessage[];
}): string {
  const { snapshot, hydrated, history, userMessage } = args;
  const compactProject = hydrated.project
    ? {
        id: hydrated.project.id,
        title: hydrated.project.title,
        summary: hydrated.project.summary,
        source: hydrated.project.source,
        project_value: hydrated.project.project_value,
        project_stage: hydrated.project.project_stage,
        posted_date: hydrated.project.posted_date,
        score: hydrated.project.score,
        rationale: hydrated.project.rationale,
        nearest_branch_id: hydrated.project.nearest_branch_id,
        distance_miles: hydrated.project.distance_miles,
        warm_for_customer_id: hydrated.project.warm_for_customer_id,
        verified: hydrated.project.verified ?? null,
      }
    : null;
  const compactBranch = hydrated.branch
    ? {
        id: hydrated.branch.id,
        code: hydrated.branch.code,
        name: hydrated.branch.name,
        coverage_radius_miles: hydrated.branch.coverage_radius_miles,
      }
    : null;
  const compactCustomer = hydrated.warmCustomer
    ? {
        id: hydrated.warmCustomer.id,
        name: hydrated.warmCustomer.name,
        served_by_branch_id: hydrated.warmCustomer.served_by_branch_id,
      }
    : null;
  const compactFiltered = hydrated.filteredProjects.slice(0, 50).map((p) => ({
    id: p.id,
    title: p.title,
    score: p.score,
    project_value: p.project_value,
    nearest_branch_id: p.nearest_branch_id,
    project_stage: p.project_stage,
    distance_miles: p.distance_miles,
    posted_date: p.posted_date,
  }));
  const branches = hydrated.allBranches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));

  const blocks: string[] = [
    `VIEW: ${snapshot.view}`,
    `FOCUSED PROJECT: ${JSON.stringify(compactProject)}`,
    `FOCUSED BRANCH: ${JSON.stringify(compactBranch)}`,
    `WARM CUSTOMER: ${JSON.stringify(compactCustomer)}`,
    `BRANCHES: ${JSON.stringify(branches)}`,
    `FILTERED PROJECTS (top ${compactFiltered.length}): ${JSON.stringify(compactFiltered)}`,
    `SOURCE FILTER: ${snapshot.sourceFilter} | CROSS-POLL: ${snapshot.crossPoll}`,
    `TOTAL PROJECTS IN VIEW: ${snapshot.totalProjects}`,
  ];
  if (history.length > 0) {
    const compactHistory = history.slice(-HISTORY_TURN_LIMIT).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 1200),
    }));
    blocks.push(`PRIOR TURNS: ${JSON.stringify(compactHistory)}`);
  }
  blocks.push(`USER MESSAGE: ${userMessage}`);
  return blocks.join('\n\n');
}

async function* streamInternal(args: {
  client: Anthropic;
  userMessage: string;
  snapshot: ChatContextSnapshot;
  hydrated: Hydrated;
  history: ChatMessage[];
  model: string;
}): AsyncGenerator<{ delta?: string; tables?: string[] }> {
  const stream = args.client.messages.stream({
    model: args.model,
    max_tokens: 1024,
    system: buildInternalSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: buildInternalUserPayload({
          userMessage: args.userMessage,
          snapshot: args.snapshot,
          hydrated: args.hydrated,
          history: args.history,
        }),
      },
    ],
  });

  let accumulated = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      accumulated += text;
      yield { delta: text };
    }
  }
  // Strip the TABLES: trailing line and surface tables array.
  const tables = parseTablesFooter(accumulated);
  if (tables.length > 0) {
    yield { tables };
  }
}

function parseTablesFooter(text: string): string[] {
  const m = text.match(/TABLES:\s*([^\n]+)$/m);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^pathfinder\./, ''))
    .filter((s) => s.length > 0);
}

// ── Web research path (Sonar) ─────────────────────────────────────────────

function buildSonarQuery(userMessage: string, hydrated: Hydrated): string {
  const projectHint = hydrated.project
    ? ` Project context: "${hydrated.project.title}".`
    : '';
  return `${userMessage}${projectHint}`;
}

// ── POST handler ──────────────────────────────────────────────────────────

interface PostBody {
  contextKey: string;
  contextLabel: string;
  contextSnapshot: ChatContextSnapshot;
  message: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!body.message || !body.contextKey) {
    return new Response(JSON.stringify({ error: 'message_and_contextKey_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1. Thread + user message persistence.
        const thread = await getOrCreateThread({
          userEmail,
          contextKey: body.contextKey,
          contextLabel: body.contextLabel,
          snapshot: body.contextSnapshot,
        });
        await appendMessage({
          threadId: thread.id,
          role: 'user',
          content: body.message,
        });

        // 2. Classify.
        const client = anthropic();
        const classification = await classify(client, body.message, body.contextSnapshot);

        // 3. Determine effective response kind (handle Sonar-unconfigured).
        let kind: ResponseKind = classification.kind;
        if (kind === 'web_research' && !isSonarConfigured()) {
          kind = 'sonar_unconfigured';
        }

        controller.enqueue(sseChunk({ type: 'meta', threadId: thread.id, kind }));

        // 4. Dispatch.
        const hydrated = await hydrateContext(body.contextSnapshot);
        const history = await loadHistory(thread.id, HISTORY_TURN_LIMIT);

        if (kind === 'sonar_unconfigured') {
          controller.enqueue(sseChunk({ type: 'delta', text: SONAR_UNCONFIGURED_MESSAGE }));
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'text',
            content: SONAR_UNCONFIGURED_MESSAGE,
            payload: {
              degraded: true,
              reason: 'sonar_not_configured',
              classified_as: classification.kind,
            },
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        if (kind === 'outreach_draft') {
          if (!hydrated.project) {
            const fallback =
              "I can draft outreach when a project is open. Click a project on the map or in the right rail, then ask again.";
            controller.enqueue(sseChunk({ type: 'delta', text: fallback }));
            await appendMessage({
              threadId: thread.id,
              role: 'assistant',
              content: fallback,
              payload: { reason: 'no_project_open' },
            });
            controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
            controller.close();
            return;
          }

          const bundle = await draftOutreach({
            project: hydrated.project,
            branch: hydrated.branch,
            warmCustomer: hydrated.warmCustomer,
            intent: classification.outreachIntent ?? 'fresh',
            audienceOverride: classification.audienceOverride,
          });

          // Stream a brief intro so the UI shows progress before the bundle.
          const intro = bundle.verifierWarnings.length === 0
            ? "Here is a 3-channel outreach bundle. Length and tone rules pass."
            : `Here is a best-effort 3-channel bundle. Verifier flagged: ${bundle.verifierWarnings.join(', ')}. Review before sending.`;
          controller.enqueue(sseChunk({ type: 'delta', text: intro }));
          controller.enqueue(sseChunk({ type: 'outreach', bundle }));
          controller.enqueue(
            sseChunk({
              type: 'actions',
              items: [
                { id: 'copy_draft', label: 'Copy' },
                { id: 'save_draft', label: 'Save draft' },
                { id: 'regenerate_draft', label: 'Regenerate' },
              ],
            }),
          );
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'outreach_draft',
            content: intro,
            payload: { bundle, intent: classification.outreachIntent ?? 'fresh' },
            modelUsed: bundle.modelUsed,
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        if (kind === 'web_research') {
          const sonarQuery = buildSonarQuery(body.message, hydrated);
          let acc = '';
          let citations: ChatSourceCitation[] = [];
          try {
            for await (const ev of streamSonar({ query: sonarQuery, recencyDays: 30 })) {
              if (ev.type === 'delta') {
                acc += ev.text;
                controller.enqueue(sseChunk({ type: 'delta', text: ev.text }));
              } else if (ev.type === 'citations') {
                citations = ev.items;
                controller.enqueue(sseChunk({ type: 'sources', items: ev.items }));
              }
            }
          } catch (err) {
            const fallback =
              err instanceof SonarRequestError
                ? `Web research request failed (status ${err.status}). Try again, or rephrase to use only data from the dashboard.`
                : `Web research is currently unavailable. Try again, or rephrase to use only data from the dashboard.`;
            controller.enqueue(sseChunk({ type: 'delta', text: fallback }));
            await appendMessage({
              threadId: thread.id,
              role: 'assistant',
              kind: 'error',
              content: fallback,
              payload: { reason: 'sonar_error', detail: String(err) },
            });
            controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
            controller.close();
            return;
          }

          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'text',
            content: acc.trim(),
            payload: { sources: citations, classified_as: 'web_research' },
            modelUsed: 'sonar',
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        if (kind === 'workflow_action') {
          // Surface the action as a button. The user clicks to execute.
          // The classifier already picked the action_id; we trust it.
          const reply = workflowActionPrompt();
          controller.enqueue(sseChunk({ type: 'delta', text: reply }));
          // Note: the actions list comes from the classifier reasoning; we
          // expose all wired actions inline so the user can pick.
          controller.enqueue(
            sseChunk({
              type: 'actions',
              items: [
                { id: 'export_csv', label: 'Export CSV' },
                { id: 'summarize_pipeline', label: 'Summarize pipeline' },
                { id: 'accept_lead_to_hubspot', label: 'Accept to HubSpot' },
                { id: 'schedule_followup', label: 'Schedule follow-up' },
              ],
            }),
          );
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'text',
            content: reply,
            payload: { classified_as: 'workflow_action' },
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        // read_only_internal or forecast_or_summary — both stream from
        // Sonnet over the hydrated internal data.
        let acc = '';
        let tables: string[] = [];
        for await (const chunk of streamInternal({
          client,
          userMessage: body.message,
          snapshot: body.contextSnapshot,
          hydrated,
          history,
          model: kind === 'forecast_or_summary' ? SUMMARY_MODEL : CHAT_MODEL,
        })) {
          if (chunk.delta) {
            const visible = chunk.delta;
            acc += visible;
            // Strip a trailing TABLES: footer line from the streamed deltas
            // so the user doesn't see it. We only suppress when a delta
            // begins with TABLES: at the start of a line — otherwise we
            // pass through.
            const safe = stripTablesFooter(visible, acc);
            if (safe.length > 0) {
              controller.enqueue(sseChunk({ type: 'delta', text: safe }));
            }
          }
          if (chunk.tables) tables = chunk.tables;
        }

        if (tables.length > 0) {
          controller.enqueue(sseChunk({ type: 'sources', items: [], tables }));
        }
        await appendMessage({
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content: stripTrailingTablesLine(acc).trim(),
          payload: { tables, classified_as: classification.kind },
          modelUsed: kind === 'forecast_or_summary' ? SUMMARY_MODEL : CHAT_MODEL,
        });
        controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(sseChunk({ type: 'error', message }));
        controller.close();
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

function workflowActionPrompt(): string {
  return 'Pick an action below. CSV export and pipeline summary run instantly. HubSpot push and scheduled follow-up are queued for when those integrations land.';
}

function stripTablesFooter(delta: string, accumulated: string): string {
  // If the accumulated stream now contains "TABLES:" (header for the
  // structured footer the model emits at the end), suppress everything
  // from there onward. The current `delta` is what we just received.
  const tablesIdx = accumulated.lastIndexOf('TABLES:');
  if (tablesIdx < 0) return delta;
  const accBefore = accumulated.slice(0, tablesIdx);
  const visibleSoFar = accBefore.length;
  // delta arrived AFTER `accBefore` was already streamed. The portion of
  // `delta` we should keep is whatever overlaps with the visible region.
  const accLength = accumulated.length;
  const deltaStart = accLength - delta.length;
  if (deltaStart >= visibleSoFar) return ''; // entirely after the footer
  return delta.slice(0, visibleSoFar - deltaStart);
}

function stripTrailingTablesLine(text: string): string {
  return text.replace(/\n?TABLES:\s*[^\n]*\s*$/m, '');
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const contextKey = searchParams.get('contextKey');
  const fallback = searchParams.get('fallback');

  const admin = supabaseAdmin();
  let thread: ChatThread | null = null;

  if (contextKey) {
    const { data } = await admin
      .from('chat_threads')
      .select('*')
      .eq('user_email', userEmail)
      .eq('context_key', contextKey)
      .maybeSingle();
    thread = (data ?? null) as ChatThread | null;
  }

  let resumed: { fromContextKey: string; fromContextLabel: string } | undefined;
  if (!thread && fallback === 'recent') {
    const { data } = await admin
      .from('chat_threads')
      .select('*')
      .eq('user_email', userEmail)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    thread = (data ?? null) as ChatThread | null;
    if (thread && thread.context_key !== contextKey) {
      resumed = {
        fromContextKey: thread.context_key,
        fromContextLabel: thread.context_label,
      };
    }
  }

  let messages: ChatMessage[] = [];
  if (thread) {
    const { data } = await admin
      .from('chat_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .limit(MESSAGES_GET_LIMIT);
    messages = ((data ?? []) as ChatMessage[]) ?? [];
  }

  return new Response(
    JSON.stringify({ thread, messages, resumed: resumed ?? null }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );
}
