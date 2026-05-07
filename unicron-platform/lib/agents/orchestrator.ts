// lib/agents/orchestrator.ts — Sprint 2 Stream B
// Orchestrator agent — the primary routing brain of the Unicron Nervous System.
//
// Entry point: orchestratorProcess(input)
// Called by: lib/agents/inngest-fns.ts → orchestrator-run Inngest function
//            (which is triggered by orchestrator/slack.event emitted from
//             api/slack/events.ts — Stream A)
//
// Pipeline:
//   1. Map Slack user ID to team_member row
//   2. Taboo Keeper inline check (full module lives in Pathfinder lib/taboo-keeper.ts)
//   3. Classify intent (dispatch_claude_code | create_action_item | semantic_search |
//                       reassign_dri | escalate | reply_only)
//   4. Dispatch / respond per intent type
//   5. Write memory entry to vault
//   6. Post Slack reply

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'nervous_system' } }
);

// ---------------------------------------------------------------------------
// Taboo check
// ---------------------------------------------------------------------------

/**
 * Fetch the taboos list from the vault.
 * Returns empty string if the file doesn't exist yet.
 */
async function fetchTaboos(): Promise<string> {
  const token = process.env.GITHUB_VAULT_TOKEN!;
  const res = await fetch(
    'https://api.github.com/repos/freakngenius/unicron-knowledge/contents/wiki/memory/taboos.md',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    }
  );
  return res.ok ? res.text() : '';
}

interface TabooResult {
  verdict: 'pass' | 'bounce';
  reason?: string;
}

/**
 * Inline Taboo Keeper check using a lightweight Haiku call.
 * The full taboo-keeper module lives in Pathfinder/lib/taboo-keeper.ts and is
 * imported by the Pathfinder API routes. This version gives unicron-platform
 * the same guard without a cross-app import.
 */
async function tabooCheck(intent: string, taboos: string): Promise<TabooResult> {
  if (!taboos) return { verdict: 'pass' };

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: `You are a taboo checker. Given an intent and a list of taboos, return JSON: {"verdict":"pass"|"bounce","reason":"..."}.
Taboos:\n${taboos}`,
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
// Team member resolution
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

/**
 * Map a Slack user ID to a nervous_system.team_members row.
 * The config JSONB column stores { ingest_accounts: { slack_user_id: "..." } }.
 */
async function resolveTeamMember(slackUserId: string): Promise<TeamMember | null> {
  const { data } = await supabase
    .from('team_members')
    .select('id, name, email')
    .filter('config->ingest_accounts->>slack_user_id', 'eq', slackUserId)
    .single<TeamMember>();

  return data ?? null;
}

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

type IntentType =
  | 'dispatch_claude_code'
  | 'create_action_item'
  | 'semantic_search'
  | 'reassign_dri'
  | 'escalate'
  | 'reply_only';

interface ClassifiedIntent {
  type: IntentType;
  summary: string;
  suggested_prompt?: string;
}

/**
 * Classify the user's message into one of 6 intent buckets.
 * Returns a suggested_prompt for dispatch_claude_code intents.
 */
async function classifyIntent(text: string): Promise<ClassifiedIntent> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: `Classify the intent of a Unicron team member's message. Return JSON with:
- type: one of [dispatch_claude_code, create_action_item, semantic_search, reassign_dri, escalate, reply_only]
- summary: one sentence summary
- suggested_prompt: if dispatch_claude_code, a paste-ready Claude Code prompt (otherwise omit)

dispatch_claude_code: requests involving code changes, building features, fixing bugs
create_action_item: requests to track, assign, or schedule work
semantic_search: questions about past decisions, calls, or vault content
reassign_dri: reassigning who owns a card
escalate: sensitive, unclear, or high-stakes decisions needing human review
reply_only: general questions, status checks, or acknowledgments`,
    messages: [{ role: 'user', content: text }],
  });

  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const match = raw.match(/\{.*\}/s);
    return (match
      ? JSON.parse(match[0])
      : { type: 'reply_only', summary: 'Acknowledged' }) as ClassifiedIntent;
  } catch {
    return { type: 'reply_only', summary: 'Acknowledged' };
  }
}

// ---------------------------------------------------------------------------
// Slack posting
// ---------------------------------------------------------------------------

/**
 * Post a message to a Slack channel via the bot token.
 * Silently skips if SLACK_ORCHESTRATOR_BOT_TOKEN is not yet configured.
 */
async function slackPost(channelId: string, text: string): Promise<void> {
  const token = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
  if (!token) {
    console.warn('[orchestrator] SLACK_ORCHESTRATOR_BOT_TOKEN not set — skipping Slack post');
    return;
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: channelId, text }),
  });

  if (!res.ok) {
    console.error(`[orchestrator] slackPost failed: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator process — public API
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

/**
 * Main Orchestrator process function — called by the Inngest orchestrator-run function.
 *
 * Intent dispatch matrix:
 *   dispatch_claude_code → return paste-ready Claude Code prompt
 *   create_action_item   → acknowledge (Kanban card creation live in Sprint 3)
 *   semantic_search      → acknowledge (vault search live in Sprint 3)
 *   reassign_dri         → acknowledge (live in Sprint 3)
 *   escalate             → forward to SLACK_ESCALATIONS_CHANNEL_ID
 *   reply_only           → direct reply
 */
export async function orchestratorProcess(
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  const { slack_user_id, channel_id, message_text } = input;

  // 1. Map Slack user to team_member
  const member = await resolveTeamMember(slack_user_id);
  if (!member) {
    const reply = 'Access denied. DM Kyle if you should have Orchestrator access.';
    await slackPost(channel_id, reply);
    return { status: 'access_denied', reply };
  }

  // 2. Taboo check
  const taboos = await fetchTaboos();
  const tabooResult = await tabooCheck(message_text, taboos);
  if (tabooResult.verdict === 'bounce') {
    const reply = `Taboo Keeper bounced this request: ${tabooResult.reason}`;
    await slackPost(channel_id, reply);
    await slackPost(
      process.env.SLACK_ESCALATIONS_CHANNEL_ID ?? channel_id,
      `Taboo bounce for ${member.name}: "${message_text.slice(0, 100)}" — Reason: ${tabooResult.reason}`
    );
    return { status: 'bounced', reply };
  }

  // 3. Classify intent and build reply
  const intent = await classifyIntent(message_text);
  let reply = '';

  switch (intent.type) {
    case 'dispatch_claude_code': {
      const prompt = intent.suggested_prompt ?? `# Claude Code Prompt\n\n${message_text}`;
      reply = `Here is your paste-ready Claude Code prompt:\n\n\`\`\`\n${prompt}\n\`\`\``;
      break;
    }
    case 'create_action_item':
      reply = `Action item noted: ${intent.summary}\n_(Kanban card creation live in Sprint 3)_`;
      break;
    case 'semantic_search':
      reply = `Searching vault for: "${message_text.slice(0, 80)}"\n_(Semantic search live in Sprint 3)_`;
      break;
    case 'reassign_dri':
      reply = `DRI reassignment: ${intent.summary}\n_(Live in Sprint 3)_`;
      break;
    case 'escalate':
      reply = `Escalating to team: ${intent.summary}`;
      await slackPost(
        process.env.SLACK_ESCALATIONS_CHANNEL_ID ?? channel_id,
        `Escalation from ${member.name}: ${intent.summary}`
      );
      break;
    default:
      reply = intent.summary;
  }

  // 4. Write memory entry to vault
  await writeAgentMemory(
    'orchestrator',
    `## ${new Date().toISOString()} — Dispatch\n- User: ${member.name}\n- Intent: ${intent.type}\n- Summary: ${intent.summary}`
  );

  // 5. Post reply to Slack
  await slackPost(channel_id, reply);

  return { status: 'ok', reply };
}
