// __tests__/email/webhooks.test.ts — Stream B Gate B3.
//
// Pure-parser tests for the provider payload shapes. No mocks.

import { describe, expect, it } from 'vitest';

import {
  parseGenericInbound,
  parseGmailPush,
  parseGraphNotifications,
  parseGraphValidationToken,
} from '@/lib/email/webhooks';

describe('parseGraphValidationToken', () => {
  it('returns the validationToken from the URL', () => {
    const url = new URL('https://x/api/email/webhooks/outlook?validationToken=abc-123');
    expect(parseGraphValidationToken(url)).toBe('abc-123');
  });
  it('returns null when missing', () => {
    expect(parseGraphValidationToken(new URL('https://x/whatever'))).toBeNull();
  });
});

describe('parseGraphNotifications', () => {
  it('returns [] for non-graph payloads', () => {
    expect(parseGraphNotifications({})).toEqual([]);
    expect(parseGraphNotifications(null)).toEqual([]);
    expect(parseGraphNotifications({ value: 'not-array' })).toEqual([]);
  });

  it('extracts subscriptionId, clientState, messageId, changeType', () => {
    const result = parseGraphNotifications({
      value: [
        {
          subscriptionId: 'sub-1',
          clientState: 'shared-secret',
          resource: 'Users/abc/Messages/msg-123',
          resourceData: { id: 'msg-123' },
          changeType: 'created',
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subscriptionId: 'sub-1',
      clientState: 'shared-secret',
      messageId: 'msg-123',
      changeType: 'created',
    });
  });

  it('falls back to extracting messageId from resource path', () => {
    const result = parseGraphNotifications({
      value: [
        {
          subscriptionId: 'sub-1',
          clientState: 'cs',
          resource: 'users/abc/messages/from-path',
          // resourceData missing — extractor must fall back to resource path
          changeType: 'created',
        },
      ],
    });
    expect(result[0].messageId).toBe('from-path');
  });
});

describe('parseGmailPush', () => {
  it('decodes base64 data and extracts emailAddress + historyId', () => {
    const payload = {
      emailAddress: 'rep@zedcor.com',
      historyId: '12345',
    };
    const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const decoded = parseGmailPush({
      message: { data, messageId: 'pubsub-msg-1', publishTime: '2026-05-01T00:00:00Z' },
      subscription: 'projects/x/subscriptions/y',
    });
    expect(decoded).not.toBeNull();
    expect(decoded!.emailAddress).toBe('rep@zedcor.com');
    expect(decoded!.historyId).toBe('12345');
    expect(decoded!.messageId).toBe('pubsub-msg-1');
  });

  it('returns null on malformed payload', () => {
    expect(parseGmailPush(null)).toBeNull();
    expect(parseGmailPush({})).toBeNull();
    expect(parseGmailPush({ message: { data: '!!!not-base64-json!!!' } })).toBeNull();
  });
});

describe('parseGenericInbound', () => {
  it('rejects unknown providers', () => {
    expect(
      parseGenericInbound({ provider: 'imap', thread_id: 'abc' }),
    ).toBeNull();
  });

  it('returns normalized for gmail', () => {
    const r = parseGenericInbound({
      provider: 'gmail',
      thread_id: 'thread-1',
      message_id: 'msg-1',
      from_email: 'joe@vendor.com',
      snippet: 'Sounds good',
      received_at: '2026-05-01T01:00:00Z',
    });
    expect(r).not.toBeNull();
    expect(r!.provider).toBe('gmail');
    expect(r!.providerThreadId).toBe('thread-1');
    expect(r!.providerMessageId).toBe('msg-1');
    expect(r!.fromEmail).toBe('joe@vendor.com');
    expect(r!.snippet).toBe('Sounds good');
    expect(r!.receivedAt).toBe('2026-05-01T01:00:00Z');
  });

  it('handles missing optional fields', () => {
    const r = parseGenericInbound({ provider: 'outlook', thread_id: 'thread-2' });
    expect(r).not.toBeNull();
    expect(r!.provider).toBe('outlook');
    expect(r!.providerMessageId).toBeNull();
    expect(r!.fromEmail).toBeNull();
  });

  it('rejects missing thread_id', () => {
    expect(parseGenericInbound({ provider: 'gmail' })).toBeNull();
  });
});
