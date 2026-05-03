import { describe, expect, it } from 'vitest';

import {
  groupHubspotEvents,
  parseHubspotWebhook,
  summariseEvent,
} from '@/lib/connectors/hubspot/inbound';
import { redact } from '@/lib/connectors/hubspot/outbound';

const SAMPLE = JSON.stringify([
  {
    eventId: 1,
    subscriptionId: 100,
    portalId: 12345,
    appId: 999,
    occurredAt: 1746132435000,
    subscriptionType: 'deal.creation',
    attemptNumber: 0,
    objectId: 5001,
  },
  {
    eventId: 2,
    subscriptionId: 101,
    portalId: 12345,
    appId: 999,
    occurredAt: 1746132440000,
    subscriptionType: 'deal.propertyChange',
    attemptNumber: 0,
    objectId: 5001,
    propertyName: 'dealstage',
    propertyValue: 'appointmentscheduled',
  },
  {
    eventId: 3,
    subscriptionId: 200,
    portalId: 12345,
    appId: 999,
    occurredAt: 1746132445000,
    subscriptionType: 'contact.creation',
    attemptNumber: 0,
    objectId: 8001,
  },
]);

describe('parseHubspotWebhook', () => {
  it('parses a valid v3 event array', () => {
    const evs = parseHubspotWebhook(SAMPLE);
    expect(evs).not.toBeNull();
    expect(evs).toHaveLength(3);
    expect(evs?.[0]?.subscriptionType).toBe('deal.creation');
    expect(evs?.[1]?.propertyName).toBe('dealstage');
  });

  it('returns null for non-JSON input', () => {
    expect(parseHubspotWebhook('not json')).toBeNull();
  });

  it('returns null when the payload is not an array', () => {
    expect(parseHubspotWebhook('{"foo":"bar"}')).toBeNull();
  });

  it('returns null when an event is missing load-bearing fields', () => {
    expect(parseHubspotWebhook('[{"eventId": 1}]')).toBeNull();
  });

  it('passes through propertyName / propertyValue when present', () => {
    const evs = parseHubspotWebhook(SAMPLE);
    expect(evs?.[1]?.propertyName).toBe('dealstage');
    expect(evs?.[1]?.propertyValue).toBe('appointmentscheduled');
  });
});

describe('groupHubspotEvents', () => {
  it('routes events to deal/contact/engagement/unknown', () => {
    const evs = parseHubspotWebhook(SAMPLE)!;
    const g = groupHubspotEvents(evs);
    expect(g.deal).toHaveLength(2);
    expect(g.contact).toHaveLength(1);
    expect(g.engagement).toHaveLength(0);
    expect(g.unknown).toHaveLength(0);
  });

  it('moves unrecognised subscriptionType into unknown', () => {
    const evs = parseHubspotWebhook(
      JSON.stringify([
        {
          eventId: 9,
          subscriptionId: 9,
          portalId: 1,
          occurredAt: 0,
          subscriptionType: 'note.creation',
          attemptNumber: 0,
          objectId: 1,
        },
      ]),
    )!;
    const g = groupHubspotEvents(evs);
    expect(g.unknown).toHaveLength(1);
    expect(g.deal).toHaveLength(0);
  });
});

describe('summariseEvent', () => {
  it('omits propertyName when not set', () => {
    const evs = parseHubspotWebhook(SAMPLE)!;
    expect(summariseEvent(evs[0]!)).toBe(
      'deal.creation obj=5001 portal=12345 ev=1',
    );
  });

  it('includes propertyName when set', () => {
    const evs = parseHubspotWebhook(SAMPLE)!;
    expect(summariseEvent(evs[1]!)).toBe(
      'deal.propertyChange obj=5001 portal=12345 ev=2 prop=dealstage',
    );
  });
});

describe('redact (outbound token logging)', () => {
  it('returns "<missing>" for null/empty', () => {
    expect(redact(null)).toBe('<missing>');
    expect(redact('')).toBe('<missing>');
  });

  it('returns "********" for too-short tokens', () => {
    expect(redact('short')).toBe('********');
  });

  it('returns first-4 + last-4 for long tokens', () => {
    expect(redact('abcdefghijklmnop')).toBe('abcd****mnop');
    expect(redact('CXmO_xx_token_abcd1234')).toBe('CXmO****1234');
  });
});
