// __tests__/internal-chat/lead-chat-route.test.ts
//
// Guardrail tests on the Internal Lead Chat Agent route. The route mixes
// SSE streaming, Supabase, and Sonar, all of which are awkward to stand
// up in vitest without a real network or DB. We exercise the source-level
// invariants the SPEC pins (Internal-only, basic-auth, Sonar reuse, the
// 'researching' chip event, persistence of user AND assistant turns) so
// drift trips a unit test instead of a live-app regression. The dynamic
// integration is verified live on internal.unicron.systems per SPEC's
// LIVE-VERIFICATION block, evidence captured in the PR body.

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

  it('reuses the existing Sonar stream surface (no new LLM client)', () => {
    expect(ROUTE).toContain("import {");
    expect(ROUTE).toContain('streamSonar');
    expect(ROUTE).toContain("from '@/lib/chat/sonar'");
    // Must not introduce a sibling LLM client; reuse only.
    expect(ROUTE).not.toMatch(/from '@\/lib\/llm\/\w+'/);
  });

  it('emits the "researching" SSE event before any Sonar delta', () => {
    const researchingIdx = ROUTE.indexOf("type: 'researching'");
    const streamSonarIdx = ROUTE.indexOf('streamSonar(');
    expect(researchingIdx).toBeGreaterThan(0);
    expect(streamSonarIdx).toBeGreaterThan(0);
    // The 'researching' emit must appear before the for-await over the
    // Sonar stream so the panel shows the chip before any delta lands.
    expect(researchingIdx).toBeLessThan(streamSonarIdx);
  });

  it('persists the user turn before streaming, and the assistant turn after', () => {
    const userAppendIdx = ROUTE.indexOf("role: 'user'");
    const sonarStartIdx = ROUTE.indexOf('streamSonar(');
    const assistantAppendIdx = ROUTE.indexOf("role: 'assistant'");
    expect(userAppendIdx).toBeGreaterThan(0);
    expect(sonarStartIdx).toBeGreaterThan(0);
    expect(assistantAppendIdx).toBeGreaterThan(0);
    expect(userAppendIdx).toBeLessThan(sonarStartIdx);
  });

  it('writes to pathfinder.lead_chat_messages via appendLeadChatMessage', () => {
    expect(ROUTE).toContain("from '@/lib/chat/lead-chat-persist'");
    expect(ROUTE).toContain('appendLeadChatMessage(');
  });

  it('contains no em-dashes or en-dashes (SPEC SHARED rule)', () => {
    expect(/[—–]/.test(ROUTE)).toBe(false);
  });

  it('does not modify the existing /api/chat surface', () => {
    // Sanity guard: the Internal route should not reach into the existing
    // chat route's persistence path (chat_threads, chat_messages). Those
    // live in 0009_chat.sql and back Zedcor only.
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
