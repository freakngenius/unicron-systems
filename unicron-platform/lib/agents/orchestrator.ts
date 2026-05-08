// lib/agents/orchestrator.ts — Sprint 2→3 upgrade
// Full Anthropic tool_use agent loop. Replaces the Sprint 2 intent-classifier.
//
// Model: claude-sonnet-4-6 (main loop) | claude-haiku-4-5 (taboo check only)
// Max tool iterations: 5 per turn

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';
import { logToolDispatch } from './autonomous-dispatch-log.js';

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Autonomous tool set
// ---------------------------------------------------------------------------

/**
 * Tools in this set execute directly without human relay.
 * All are pure reads or safe bounded writes (no destructive / one-way actions).
 * dispatch_claude_code is intentionally excluded — always relay-to-human.
 */
const SAFE_AUTONOMOUS_TOOLS = new Set([
  'create_action_item',
  'list_action_items',
  'get_team_member',
  'get_recent_calls',
  'get_continuity_log',
  'query_ledger',
  'reassign_dri',
  'semantic_search',
  'get_kanban_cards',
  'send_slack_message',
]);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the Orchestrator for Unicron Systems, a 3-person AI-native company (Kyle Kesterson, Keenan Hock, Curtis Smith) building Pathfinder (customer-facing lead intelligence) and Metacron (operator-facing agent platform). Your job is to be the thinking layer between the team and the company's autonomous nervous system.

You are not an intent classifier. You do not dismiss messages. Even simple greetings warrant a substantive useful reply — a status pulse, a "here's what needs you today," a proactive nudge.

When a team member DMs you or @-mentions you, you:
1. Read their message in context. Look at recent ledger entries, recent action items they own, recent calls they were in, their open kanban cards.
2. Determine intent: directive (do something), inquiry (tell me), reflection (think with me), conversational (acknowledge / respond warmly).
3. Use tools to fetch real state before answering. Do not answer from imagination when you can query.
4. If a directive requires system action (creating an action item, dispatching code, reassigning DRI, scheduling, sending a message), run the proposed action through the Taboo Keeper validator BEFORE executing. If bounced, explain the reason and propose alternatives.
5. Be specific and grounded. Reference real ledger ids, action item titles, customer names, dates, costs.
6. Push back when warranted. Do not capitulate to vague directives.
7. Match the user's energy. Kyle prefers tight, no fluff, actionable. Keenan focuses on discovery and 0->1 execution. Curtis is at peer tier with full visibility.
8. Default reply length: 1-3 sentences for greetings and acknowledgments, 1-2 paragraphs for directive responses, longer only when synthesizing real findings.
9. Never use em-dashes. Never use the framing "this isn't X. It's X." Avoid "wedge" and "what nobody is naming."
10. Sign off only when natural; do not append summaries to every message.

The current company state, refresh on every turn:
- Active customers: query nervous_system.customers.
- Open action items: query nervous_system.action_items where status in ('open','in_progress').
- Recent calls: query nervous_system.ledger where source_type='call' order by created_at desc limit 5.
- Active sprints: query nervous_system.sprint_runs where status='in_process'.
- Recent taboo bounces: query nervous_system.audit_log where action='taboo_bounce' order by created_at desc limit 3.

Available tools (use liberally):
- semantic_search(query, surface, limit) — pgvector search over ledger and vault
- get_team_member(name_or_email) — full team_member record
- list_action_items(filters) — filterable action_items query
- create_action_item(payload) — Taboo-validated action item creation
- reassign_dri(action_item_id, new_dri) — Taboo-validated reassignment
- dispatch_claude_code(directive, surface) — for production code/schema changes only — generates paste-ready Claude Code prompt for Kyle to review and run. ALL other tools execute directly.
- send_slack_message(channel, text) — post to a Slack channel
- get_kanban_cards(workspace, status) — read Notion kanban via Notion MCP
- get_recent_calls(participant, limit) — recent calls for a person
- get_continuity_log(filters) — Elder's continuity entries
- query_ledger(sql_or_filters) — direct ledger query

Refusal layer: every action that modifies state passes the Taboo Keeper. If you propose an action that the user explicitly authorizes via reply, you may execute it after validation. If the user has not authorized, propose-only — do not auto-execute destructive or one-way actions.

Voice: warm but tight. Push back on bad ideas with specifics. Treat the team as peers.`;

// ---------------------------------------------------------------------------
// Anthropic tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'semantic_search',
    description: 'pgvector semantic search over ledger entries and vault. Returns relevant records by similarity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query text' },
        surface: { type: 'string', enum: ['ledger', 'vault', 'all'], description: 'Surface to search' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_team_member',
    description: 'Look up a team member record by name or email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_or_email: { type: 'string', description: 'Full or partial name, or email address' },
      },
      required: ['name_or_email'],
    },
  },
  {
    name: 'list_action_items',
    description: 'List action items with optional filters. Use to get open work, overdue items, or items owned by a specific person.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dri_name: { type: 'string', description: 'Filter by DRI name (e.g. "Kyle")' },
        status: {
          type: 'array',
          items: { type: 'string' },
          description: 'Status filter, e.g. ["open","in_progress"]. Defaults to open + in_progress.',
        },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'create_action_item',
    description: 'Create a new action item. Runs Taboo validation first. Only call when the user has clearly directed creation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short action item title' },
        description: { type: 'string', description: 'Full description or context' },
        dri_name: { type: 'string', description: 'Name of the DRI team member' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'irreversible'] },
        due_at: { type: 'string', description: 'ISO 8601 due date/time (optional)' },
        kanban_workspace: { type: 'string', enum: ['pathfinder', 'metacron', 'internal', 'sales'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'reassign_dri',
    description: 'Reassign the DRI on an action item. Taboo-validated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_item_id: { type: 'string', description: 'UUID of the action item' },
        new_dri_name: { type: 'string', description: 'Name of the new DRI' },
      },
      required: ['action_item_id', 'new_dri_name'],
    },
  },
  {
    name: 'dispatch_claude_code',
    description: 'Generate a paste-ready Claude Code prompt for a coding directive. Returns the prompt inline.',
    input_schema: {
      type: 'object' as const,
      properties: {
        directive: { type: 'string', description: 'The coding task or change to implement' },
        surface: { type: 'string', description: 'Target codebase: pathfinder, unicron-platform, or metacron' },
      },
      required: ['directive', 'surface'],
    },
  },
  {
    name: 'send_slack_message',
    description: 'Post a message to a Slack channel. For escalations or cross-channel notifications.',
    input_schema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel ID (C...) or env var like SLACK_ESCALATIONS_CHANNEL_ID' },
        text: { type: 'string', description: 'Message text' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'get_kanban_cards',
    description: 'Read kanban cards from a Notion workspace filtered by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace: {
          type: 'string',
          enum: ['pathfinder', 'metacron', 'internal', 'sales', 'discovery'],
        },
        status: { type: 'string', description: 'Filter by card status (optional)' },
      },
      required: ['workspace'],
    },
  },
  {
    name: 'get_recent_calls',
    description: 'Get recent call records from the ledger, optionally filtered by participant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        participant: { type: 'string', description: 'Team member name to filter by (optional)' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'get_continuity_log',
    description: "Read the Elder agent's continuity log — persistent cross-session memory.",
    input_schema: {
      type: 'object' as const,
      properties: {
        filters: { type: 'string', description: 'Optional keyword to filter entries' },
      },
    },
  },
  {
    name: 'query_ledger',
    description: 'Query the nervous system ledger by source type or keyword.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source_type: {
          type: 'string',
          enum: ['call', 'slack', 'email', 'voice_memo', 'agent_run', 'manual'],
        },
        search: { type: 'string', description: 'Keyword search in content summary' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Taboo check
// ---------------------------------------------------------------------------

interface TabooResult {
  verdict: 'pass' | 'bounce';
  reason?: string;
}

async function fetchTaboos(): Promise<string> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return '';
  const res = await fetch(
    'https://api.github.com/repos/freakngenius/unicron-knowledge/contents/wiki/memory/taboos.md',
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' } }
  );
  return res.ok ? res.text() : '';
}

async function tabooCheck(intent: string, taboos: string): Promise<TabooResult> {
  if (!taboos) return { verdict: 'pass' };
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: `You are a taboo checker. Return JSON: {"verdict":"pass"|"bounce","reason":"..."}.\nTaboos:\n${taboos}`,
    messages: [{ role: 'user', content: `Intent: ${intent}` }],
  });
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const match = text.match(/\{.*\}/s);
    return (match ? JSON.parse(match[0]) : { verdict: 'pass' }) as TabooResult;
  } catch {
    return { verdict: 'pass' };
  }
}

// ---------------------------------------------------------------------------
// Autonomous dispatch audit log
// ---------------------------------------------------------------------------

/**
 * Write a structured audit log row for every Orchestrator tool dispatch.
 * Wraps logToolDispatch with safe-tool classification and truncated summaries.
 */
async function autonomousDispatchAuditLog(
  toolName: string,
  input: Record<string, unknown>,
  result: string,
  memberId: string,
  autonomous: boolean
): Promise<void> {
  try {
    await logToolDispatch({
      toolName,
      inputSummary: JSON.stringify(input),
      resultSummary: result,
      requestedByMemberId: memberId,
      autonomous,
      tabooPassed: true,
    });
  } catch (err) {
    // Non-fatal — log error but do not surface to caller
    console.error('[orchestrator] autonomousDispatchAuditLog failed:', err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Team member resolution
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

async function resolveTeamMember(slackUserId: string): Promise<TeamMember | null> {
  const { data, error } = await supabase.rpc('resolve_team_member_by_slack', {
    p_slack_user_id: slackUserId,
  });
  if (error) {
    console.error('[orchestrator] resolveTeamMember rpc error:', error.message);
    return null;
  }
  const rows = data as TeamMember[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Slack posting
// ---------------------------------------------------------------------------

async function slackPost(channelId: string, text: string): Promise<void> {
  const token = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
  if (!token) {
    console.warn('[orchestrator] SLACK_ORCHESTRATOR_BOT_TOKEN not set — skipping Slack post');
    return;
  }
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const body = await res.json() as { ok: boolean; error?: string };
  if (!body.ok) {
    console.error(`[orchestrator] slackPost failed: ${body.error} channel=${channelId}`);
  } else {
    console.log(`[orchestrator] slackPost ok channel=${channelId}`);
  }
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeToolCore(
  name: string,
  input: Record<string, unknown>,
  taboos: string
): Promise<string> {
  try {
    switch (name) {
      case 'semantic_search': {
        return JSON.stringify({
          stub: true,
          message: 'Semantic search not yet wired — needs embedding provider (Sprint 3). Use query_ledger with a keyword search as fallback.',
          query: input.query,
        });
      }

      case 'get_team_member': {
        const { data, error } = await supabase.rpc('ns_get_team_member_by_name', {
          p_name: input.name_or_email as string,
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data ?? []);
      }

      case 'list_action_items': {
        let driId: string | null = null;
        if (input.dri_name) {
          const { data: member } = await supabase.rpc('ns_get_team_member_by_name', {
            p_name: input.dri_name as string,
          });
          const rows = member as Array<{ id: string }> | null;
          driId = rows && rows.length > 0 ? rows[0].id : null;
        }
        const { data, error } = await supabase.rpc('ns_list_action_items', {
          p_dri_id: driId,
          p_status: (input.status as string[]) ?? ['open', 'in_progress'],
          p_limit: (input.limit as number) ?? 20,
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data ?? []);
      }

      case 'create_action_item': {
        const bounceCheck = await tabooCheck(`Create action item: ${input.title as string}`, taboos);
        if (bounceCheck.verdict === 'bounce') {
          return JSON.stringify({ bounced: true, reason: bounceCheck.reason });
        }
        let driId: string | null = null;
        if (input.dri_name) {
          const { data: member } = await supabase.rpc('ns_get_team_member_by_name', {
            p_name: input.dri_name as string,
          });
          const rows = member as Array<{ id: string }> | null;
          driId = rows && rows.length > 0 ? rows[0].id : null;
        }
        const { data, error } = await supabase.rpc('ns_create_action_item', {
          p_title: input.title as string,
          p_description: (input.description as string) ?? null,
          p_dri_id: driId,
          p_priority: (input.priority as string) ?? 'medium',
          p_due_at: (input.due_at as string) ?? null,
          p_kanban_workspace: (input.kanban_workspace as string) ?? 'internal',
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ created: true, action_item: data });
      }

      case 'reassign_dri': {
        const bounceCheck = await tabooCheck(
          `Reassign DRI on action_item ${input.action_item_id as string} to ${input.new_dri_name as string}`,
          taboos
        );
        if (bounceCheck.verdict === 'bounce') {
          return JSON.stringify({ bounced: true, reason: bounceCheck.reason });
        }
        const { data: memberRows } = await supabase.rpc('ns_get_team_member_by_name', {
          p_name: input.new_dri_name as string,
        });
        const rows = memberRows as Array<{ id: string }> | null;
        const newDriId = rows && rows.length > 0 ? rows[0].id : null;
        if (!newDriId) {
          return JSON.stringify({ error: `Team member "${input.new_dri_name as string}" not found` });
        }
        const { data, error } = await supabase.rpc('ns_reassign_dri', {
          p_action_item_id: input.action_item_id as string,
          p_new_dri_id: newDriId,
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ reassigned: true, result: data });
      }

      case 'dispatch_claude_code': {
        const prompt = `# 🤖 Orchestrator Autonomous Dispatch Request
# Run in a Claude Code session to execute.

# Claude Code Directive — ${input.surface as string}

## Task
${input.directive as string}

## Context
- Surface: ${input.surface as string}
- Dispatched by Orchestrator at ${new Date().toISOString()}

## Instructions
Work from the existing codebase. Follow all conventions in CLAUDE.md. Create a PR when complete.`;
        return JSON.stringify({ prompt });
      }

      case 'send_slack_message': {
        const token = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
        if (!token) return JSON.stringify({ error: 'SLACK_ORCHESTRATOR_BOT_TOKEN not set' });
        let channelId = input.channel as string;
        if (channelId.startsWith('SLACK_')) {
          channelId = process.env[channelId] ?? channelId;
        }
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: channelId, text: input.text }),
        });
        const body = await res.json() as { ok: boolean; error?: string };
        return JSON.stringify(body);
      }

      case 'get_kanban_cards': {
        return JSON.stringify({
          stub: true,
          message: `Notion kanban not yet wired (NOTION_TOKEN not configured). ${input.workspace as string} workspace unavailable via API.`,
          workspace: input.workspace,
        });
      }

      case 'get_recent_calls': {
        let participantId: string | null = null;
        if (input.participant) {
          const { data: member } = await supabase.rpc('ns_get_team_member_by_name', {
            p_name: input.participant as string,
          });
          const rows = member as Array<{ id: string }> | null;
          participantId = rows && rows.length > 0 ? rows[0].id : null;
        }
        const { data, error } = await supabase.rpc('ns_get_recent_calls', {
          p_participant_id: participantId,
          p_limit: (input.limit as number) ?? 5,
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data ?? []);
      }

      case 'get_continuity_log': {
        const token = process.env.GITHUB_VAULT_TOKEN;
        if (!token) return JSON.stringify({ error: 'GITHUB_VAULT_TOKEN not set' });
        const res = await fetch(
          'https://api.github.com/repos/freakngenius/unicron-knowledge/contents/wiki/memory/elder/continuity.md',
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' } }
        );
        if (res.status === 404) {
          return JSON.stringify({ content: 'Continuity log not yet initialized.' });
        }
        if (!res.ok) return JSON.stringify({ error: `GitHub API: ${res.status}` });
        const content = await res.text();
        const filter = input.filters as string | undefined;
        if (filter) {
          const lines = content.split('\n').filter(l =>
            l.toLowerCase().includes(filter.toLowerCase())
          );
          return JSON.stringify({ content: lines.join('\n'), filtered: true });
        }
        return JSON.stringify({ content: content.slice(0, 4000) });
      }

      case 'query_ledger': {
        const { data, error } = await supabase.rpc('ns_query_ledger', {
          p_source_type: (input.source_type as string) ?? null,
          p_search: (input.search as string) ?? null,
          p_limit: (input.limit as number) ?? 10,
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data ?? []);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] tool ${name} threw:`, message);
    return JSON.stringify({ error: message });
  }
}

/**
 * Public tool executor — wraps executeToolCore with:
 *   1. Taboo Keeper gate: every tool call is checked before execution.
 *   2. Audit log: writes a row to audit_log after every dispatch, recording
 *      whether the tool ran autonomously or requires human relay.
 */
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  taboos: string,
  memberId: string
): Promise<string> {
  // 1. Taboo gate — runs before every tool execution, not just state-mutating ones.
  const intentSummary = `Tool: ${name} — input: ${JSON.stringify(input).slice(0, 200)}`;
  const tabooResult = await tabooCheck(intentSummary, taboos);

  if (tabooResult.verdict === 'bounce') {
    const errorResult = JSON.stringify({
      error: `Taboo Keeper bounced: ${tabooResult.reason ?? 'No reason provided'}`,
      bounced: true,
      tool: name,
    });
    // Audit log for bounced tool (tabooPassed=false)
    try {
      await logToolDispatch({
        toolName: name,
        inputSummary: JSON.stringify(input),
        resultSummary: errorResult,
        requestedByMemberId: memberId,
        autonomous: false,
        tabooPassed: false,
        tabooReason: tabooResult.reason,
      });
    } catch (auditErr) {
      console.error('[orchestrator] audit log failed (bounce):', auditErr instanceof Error ? auditErr.message : String(auditErr));
    }
    console.warn(`[orchestrator] taboo bounce for tool=${name}: ${tabooResult.reason}`);
    return errorResult;
  }

  // 2. Execute the tool
  const result = await executeToolCore(name, input, taboos);

  // 3. Audit log for executed tool
  const autonomous = SAFE_AUTONOMOUS_TOOLS.has(name);
  await autonomousDispatchAuditLog(name, input, result, memberId, autonomous);

  return result;
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

async function runOrchestratorAgent(
  member: TeamMember,
  messageText: string,
  taboos: string,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `[From: ${member.name}]\n\n${messageText}` },
  ];

  for (let iteration = 0; iteration < 5; iteration++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    console.log(`[orchestrator] iteration=${iteration} stop_reason=${response.stop_reason}`);

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock && textBlock.type === 'text' ? textBlock.text : 'Done.';
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async block => {
          console.log(`[orchestrator] tool: ${block.name}`, JSON.stringify(block.input).slice(0, 100));
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            taboos,
            member.id
          );
          console.log(`[orchestrator] result: ${block.name}`, result.slice(0, 100));
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          };
        })
      );

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop — return whatever text exists
    const fallback = response.content.find(b => b.type === 'text');
    return fallback && fallback.type === 'text'
      ? fallback.text
      : `Stopped (${response.stop_reason}).`;
  }

  return 'Reached max tool iterations — please simplify the request.';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OrchestratorInput {
  slack_user_id: string;
  channel_id: string;
  message_text: string;
  thread_ts?: string | null;
  event_type: string;
  team_id: string | null;
}

export interface OrchestratorOutput {
  status: 'ok' | 'access_denied' | 'bounced';
  reply: string;
}

export async function orchestratorProcess(
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  const { slack_user_id, channel_id, message_text } = input;

  console.log(`[orchestrator] resolving slack_user_id=${slack_user_id} channel=${channel_id}`);
  const member = await resolveTeamMember(slack_user_id);
  console.log(`[orchestrator] member resolved: ${member ? member.name : 'null'}`);

  if (!member) {
    const reply = 'Access denied. DM Kyle if you should have Orchestrator access.';
    await slackPost(channel_id, reply);
    return { status: 'access_denied', reply };
  }

  const taboos = await fetchTaboos();

  const preCheck = await tabooCheck(message_text, taboos);
  if (preCheck.verdict === 'bounce') {
    const reply = `Taboo Keeper bounced this: ${preCheck.reason}`;
    await slackPost(channel_id, reply);
    await slackPost(
      process.env.SLACK_ESCALATIONS_CHANNEL_ID ?? channel_id,
      `Taboo bounce for ${member.name}: "${message_text.slice(0, 100)}" — ${preCheck.reason}`
    );
    return { status: 'bounced', reply };
  }

  const reply = await runOrchestratorAgent(member, message_text, taboos);

  await writeAgentMemory(
    'orchestrator',
    `## ${new Date().toISOString()} — Turn\n- User: ${member.name}\n- Message: ${message_text.slice(0, 100)}\n- Reply: ${reply.slice(0, 100)}`
  );

  await slackPost(channel_id, reply);

  return { status: 'ok', reply };
}
