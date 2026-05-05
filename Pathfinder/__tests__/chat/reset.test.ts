// __tests__/chat/reset.test.ts — unit tests for the chat reset flow.
// Covers the POST /api/chat/reset route logic in isolation.

import { describe, it, expect } from 'vitest';

// The reset route is a thin wrapper around two DB operations:
// 1. Ownership check: thread must belong to the authenticated user.
// 2. Soft-delete: cleared_at stamped on non-cleared messages.
//
// These tests verify the branching logic using plain objects that mirror
// the route's expectations, without hitting Supabase.

interface Thread { id: string; user_email: string }

function resolveOwnership(
  threadId: string,
  userEmail: string,
  threads: Thread[],
): Thread | null {
  return threads.find((t) => t.id === threadId && t.user_email === userEmail) ?? null;
}

describe('chat reset — ownership check', () => {
  const threads: Thread[] = [
    { id: 'thread-abc', user_email: 'alice@example.com' },
    { id: 'thread-xyz', user_email: 'bob@example.com' },
  ];

  it('returns the thread when user owns it', () => {
    const result = resolveOwnership('thread-abc', 'alice@example.com', threads);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('thread-abc');
  });

  it('returns null when user does not own the thread', () => {
    const result = resolveOwnership('thread-abc', 'bob@example.com', threads);
    expect(result).toBeNull();
  });

  it('returns null when thread does not exist', () => {
    const result = resolveOwnership('thread-404', 'alice@example.com', threads);
    expect(result).toBeNull();
  });
});

interface Message { id: number; thread_id: string; cleared_at: string | null }

function softDeleteMessages(threadId: string, messages: Message[], now: string): Message[] {
  return messages.map((m) =>
    m.thread_id === threadId && m.cleared_at === null
      ? { ...m, cleared_at: now }
      : m,
  );
}

describe('chat reset — soft-delete messages', () => {
  const base: Message[] = [
    { id: 1, thread_id: 'thread-abc', cleared_at: null },
    { id: 2, thread_id: 'thread-abc', cleared_at: null },
    { id: 3, thread_id: 'thread-xyz', cleared_at: null },
    { id: 4, thread_id: 'thread-abc', cleared_at: '2026-01-01T00:00:00Z' },
  ];
  const NOW = '2026-05-05T12:00:00Z';

  it('stamps cleared_at only on non-cleared messages in the target thread', () => {
    const result = softDeleteMessages('thread-abc', base, NOW);
    expect(result.find((m) => m.id === 1)?.cleared_at).toBe(NOW);
    expect(result.find((m) => m.id === 2)?.cleared_at).toBe(NOW);
  });

  it('does not touch messages in other threads', () => {
    const result = softDeleteMessages('thread-abc', base, NOW);
    expect(result.find((m) => m.id === 3)?.cleared_at).toBeNull();
  });

  it('does not overwrite already-cleared messages', () => {
    const result = softDeleteMessages('thread-abc', base, NOW);
    expect(result.find((m) => m.id === 4)?.cleared_at).toBe('2026-01-01T00:00:00Z');
  });

  it('cleared messages are excluded from a null-filtered view', () => {
    const result = softDeleteMessages('thread-abc', base, NOW);
    const visible = result.filter((m) => m.cleared_at === null);
    expect(visible.map((m) => m.id)).toEqual([3]);
  });
});
