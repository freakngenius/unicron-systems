// Gate 13X-A — type-level test for the OutreachReply row shape.
//
// No app code consumes OutreachReply yet — Gate 13X-B (Gmail inbound),
// 13X-C (Outlook inbound), and 13X-D (Reply UI) will adopt it. This
// test exists to guarantee the type extension actually compiles and
// remains structurally stable so the downstream gates do not discover
// a drift on first use.

import { describe, expect, it } from 'vitest';

import type { OutreachReply } from '@/lib/types';

const SAMPLE_REPLY: OutreachReply = {
  id: '11111111-1111-4111-8111-111111111111',
  outreach_send_id: '22222222-2222-4222-8222-222222222222',
  received_at: '2026-05-03T14:00:00.000Z',
  from_email: 'jane.doe@txdot.gov',
  subject: 'Re: Quick intro — perimeter security on I-45',
  body_text: 'Thanks for reaching out — happy to set up a 15 min call next week.',
  body_html: '<p>Thanks for reaching out — happy to set up a 15 min call next week.</p>',
  message_id: '<CAFx=abc123@mail.gmail.com>',
  thread_id: '18f9b4e0a1b2c3d4',
  raw_headers: {
    'message-id': '<CAFx=abc123@mail.gmail.com>',
    'in-reply-to': '<orig-send-id@pathfinder.app>',
    references: '<orig-send-id@pathfinder.app>',
  },
  processed_at: null,
};

const NULL_FIELDS_REPLY: OutreachReply = {
  id: '33333333-3333-4333-8333-333333333333',
  outreach_send_id: '44444444-4444-4444-8444-444444444444',
  received_at: '2026-05-03T14:05:00.000Z',
  from_email: 'minimal@example.com',
  subject: null,
  body_text: null,
  body_html: null,
  message_id: null,
  thread_id: null,
  raw_headers: null,
  processed_at: null,
};

describe('OutreachReply type contract', () => {
  it('compiles + accepts a fully-populated reply row', () => {
    expect(SAMPLE_REPLY.outreach_send_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(SAMPLE_REPLY.from_email).toBe('jane.doe@txdot.gov');
    expect(SAMPLE_REPLY.thread_id).toBe('18f9b4e0a1b2c3d4');
    expect(SAMPLE_REPLY.raw_headers?.['message-id']).toBe('<CAFx=abc123@mail.gmail.com>');
    expect(SAMPLE_REPLY.processed_at).toBeNull();
  });

  it('compiles + accepts a row with all-nullable fields nulled', () => {
    expect(NULL_FIELDS_REPLY.subject).toBeNull();
    expect(NULL_FIELDS_REPLY.body_text).toBeNull();
    expect(NULL_FIELDS_REPLY.body_html).toBeNull();
    expect(NULL_FIELDS_REPLY.message_id).toBeNull();
    expect(NULL_FIELDS_REPLY.thread_id).toBeNull();
    expect(NULL_FIELDS_REPLY.raw_headers).toBeNull();
    expect(NULL_FIELDS_REPLY.processed_at).toBeNull();
  });

  it('processed_at can be set to an ISO timestamp once a reply is handled', () => {
    const processed: OutreachReply = {
      ...NULL_FIELDS_REPLY,
      processed_at: '2026-05-03T14:10:00.000Z',
    };
    expect(processed.processed_at).toBe('2026-05-03T14:10:00.000Z');
  });
});
