// tests/connectors/chat-bridge.test.ts — strip-mention + clipReply unit tests.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { clipReply, routeChatMessage, stripBotMention } from '@/lib/connectors/slack/chat-bridge';

describe('stripBotMention', () => {
  it('removes <@BOT> from the front', () => {
    expect(stripBotMention('<@U999> hello there', 'U999')).toBe(' hello there');
  });

  it('removes <@BOT|name>', () => {
    expect(stripBotMention('<@U999|pathfinder> hello', 'U999')).toBe(' hello');
  });

  it('leaves other user mentions intact', () => {
    expect(stripBotMention('<@U123> hi <@U999>', 'U999')).toBe('<@U123> hi ');
  });

  it('returns text unchanged when no botUserId is known', () => {
    expect(stripBotMention('hello', null)).toBe('hello');
  });
});

describe('clipReply', () => {
  it('passes short strings through', () => {
    expect(clipReply('short')).toBe('short');
  });

  it('truncates strings over 1200 chars', () => {
    const big = 'a'.repeat(2000);
    const out = clipReply(big);
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('routeChatMessage', () => {
  it('returns a help-style reply for empty text after stripping mention', async () => {
    const out = await routeChatMessage({ text: '<@U1>', botUserId: 'U1' });
    expect(out.routed).toBe(false);
    expect(out.reply).toMatch(/Pathfinder/);
  });

  it('echoes the trimmed user message back as routed', async () => {
    const out = await routeChatMessage({ text: '<@U1> what is up?', botUserId: 'U1' });
    expect(out.routed).toBe(true);
    expect(out.reply).toContain('what is up?');
  });
});
