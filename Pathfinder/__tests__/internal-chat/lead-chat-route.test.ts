// __tests__/internal-chat/lead-chat-route.test.ts
//
// Guardrail tests on the Internal Lead Chat Agent route. The route mixes
// SSE streaming, Supabase, and a two-tool agent (Claude + Sonar), all of
// which are awkward to stand up in vitest without a real network or DB.
// We exercise the source-level invariants the SPEC pins (Internal-only,
// basic-auth, agent orchestrator usage, persistence). Drift trips a unit
// test instead of a live-app regression. Dynamic integration is verified
// live per the SPEC's LIVE-VERIFICATION block; evidence in the PR body.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTE = readFileSync(
  path.resolve(__dirname, '../../app/api/internal/chat/route.ts'),
  'utf8',
);

describe('app/api/internal/chat/route.ts source invariants', () => {
  it('exports POST and GET handlers', () => {
    expect(ROUTE).toMatch(/export async function POST\b/);
    expect(ROUTE).toMatch(/export async function GET\b/);
  });

  it('refuses any org_slug that is not "internal" with HTTP 403', () => {
    expect(ROUTE).toContain("org_slug !== INTERNAL_SLUG");
    expect(ROUTE).toContain('internal_only');
    expect(ROUTE).toMatch(/status:\s*403/);
  });

  it('requires basic-auth and returns 401 when missing', () => {
    expect(ROUTE).toContain("'unauthorized'");
    expect(ROUTE).toMatch(/status:\s*401/);
    expect(ROUTE).toContain('userEmailFromRequest');
  });

  it('dispatches through the two-tool orchestrator, not Sonar directly', () => {
    expect(ROUTE).toContain("from '@/lib/chat/internal-chat-agent'");
    expect(ROUTE).toContain('runInternalChatAgent(');
    // Sonar is reached through the agent tool now, never imported directly
    // by the route. The agent file is the one place that imports Sonar.
    expect(ROUTE).not.toContain("from '@/lib/chat/sonar'");
    expect(ROUTE).not.toMatch(/\bstreamSonar\(/);
  });

  it('persists the user turn before invoking the agent', () => {
    const userAppendIdx = ROUTE.indexOf("role: 'user'");
    const agentInvokeIdx = ROUTE.indexOf('runInternalChatAgent(');
    expect(userAppendIdx).toBeGreaterThan(0);
    expect(agentInvokeIdx).toBeGreaterThan(0);
    expect(userAppendIdx).toBeLessThan(agentInvokeIdx);
  });

  it('writes assistant, tool, and (on failure) error rows to lead_chat_messages', () => {
    expect(ROUTE).toContain("from '@/lib/chat/lead-chat-persist'");
    expect(ROUTE).toContain("role: 'assistant'");
    expect(ROUTE).toContain("role: 'tool'");
    expect(ROUTE).toContain("kind: 'error'");
  });

  it('contains no em-dashes or en-dashes (SPEC SHARED rule)', () => {
    expect(/[—–]/.test(ROUTE)).toBe(false);
  });

  it('does not modify the existing /api/chat surface (Zedcor)', () => {
    expect(ROUTE).not.toContain("from('chat_threads')");
    expect(ROUTE).not.toContain("from('chat_messages')");
  });
});

const PERSIST = readFileSync(
  path.resolve(__dirname, '../../lib/chat/lead-chat-persist.ts'),
  'utf8',
);

describe('lib/chat/lead-chat-persist.ts', () => {
  it('targets the lead_chat_messages table only', () => {
    expect(PERSIST).toContain("from('lead_chat_messages')");
    expect(PERSIST).not.toContain("from('chat_threads')");
    expect(PERSIST).not.toContain("from('chat_messages')");
  });

  it('scopes thread reads to (thread_id, user_email) so users cannot read each other', () => {
    expect(PERSIST).toMatch(/eq\('thread_id'/);
    expect(PERSIST).toMatch(/eq\('user_email'/);
  });
});

const AGENT = readFileSync(
  path.resolve(__dirname, '../../lib/chat/internal-chat-agent.ts'),
  'utf8',
);

describe('lib/chat/internal-chat-agent.ts source invariants', () => {
  it('registers both tools with the orchestrator LLM', () => {
    expect(AGENT).toContain("name: 'pathfinder_leads'");
    expect(AGENT).toContain("name: 'perplexity_research'");
  });

  it('describes pathfinder_leads as the PRIMARY tool', () => {
    expect(AGENT).toMatch(/PRIMARY tool: `pathfinder_leads`|PRIMARY[\s\S]{0,40}pathfinder_leads|pathfinder_leads[\s\S]{0,40}PRIMARY/);
  });

  it('emits researching only when perplexity_research is the active tool', () => {
    expect(AGENT).toContain("'perplexity-sonar'");
    expect(AGENT).toMatch(/block\.name === 'perplexity_research'/);
  });

  it('hard-caps tool-call rounds (no infinite loop)', () => {
    expect(AGENT).toMatch(/MAX_TOOL_ROUNDS\s*=\s*\d+/);
  });

  it('contains no em-dashes or en-dashes', () => {
    expect(/[—–]/.test(AGENT)).toBe(false);
  });

  it('reuses the existing Sonar wrapper rather than re-implementing the call', () => {
    expect(AGENT).toContain("from '@/lib/chat/sonar'");
    expect(AGENT).toContain('completeSonar');
  });
});
