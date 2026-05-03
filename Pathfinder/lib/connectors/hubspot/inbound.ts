// lib/connectors/hubspot/inbound.ts — Demo Polish UX Gate 4B-1.
//
// HubSpot v3 webhook payloads arrive as an array of events. Each event is
// a small object with subscriptionType + objectId + (for property change)
// propertyName + propertyValue. This module:
//
//   1. Parses + validates the event array shape.
//   2. Routes per-event to a small set of handlers (deal / contact /
//      engagement creation + property change).
//   3. Records each event to `pathfinder.connector_audit_log` for
//      operator visibility, regardless of whether the handler succeeded.
//
// The actual mutation logic (upsert into pathfinder.deals,
// pathfinder.project_contacts) is delegated to handler functions so the
// route handler stays thin. Network calls back to HubSpot to fetch the
// full object live in `lib/connectors/hubspot/fetch.ts` (Gate 4B-1
// follow-up).
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 6 "HubSpot
// inbound" + the operator-todo at MEMORY/operator-todos/2026-05-XX-
// hubspot-end-to-end-setup.md.

export type HubspotSubscriptionType =
  | 'deal.creation'
  | 'deal.propertyChange'
  | 'deal.deletion'
  | 'contact.creation'
  | 'contact.propertyChange'
  | 'contact.deletion'
  | 'engagement.creation'
  | 'engagement.propertyChange';

export interface HubspotEvent {
  /** HubSpot event id; idempotency key. */
  eventId: number;
  /** App-level subscription identifier (matches the registration in the
   *  HubSpot dashboard). */
  subscriptionId: number;
  /** Portal id of the source HubSpot account (== `connectors.account_external_id`). */
  portalId: number;
  /** Subscription type (event family). */
  subscriptionType: HubspotSubscriptionType | string;
  /** ms-epoch the event was generated. */
  occurredAt: number;
  /** Numeric retry counter; 0 on first delivery. */
  attemptNumber: number;
  /** The HubSpot object the event refers to (deal id, contact id, ...). */
  objectId: number;
  /** Only set on `propertyChange` events. */
  propertyName?: string;
  /** Only set on `propertyChange` events. */
  propertyValue?: string;
  /** Pass-through for unknown fields; tests rely on this shape. */
  [key: string]: unknown;
}

/**
 * Parse a raw webhook body into the event array. Returns `null` when the
 * body is not a JSON array or any element is missing the load-bearing
 * fields. The route handler should treat null as a 200-with-warning so
 * HubSpot doesn't enter a retry loop on a payload we can't process.
 */
export function parseHubspotWebhook(rawBody: string): HubspotEvent[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const out: HubspotEvent[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.eventId !== 'number' ||
      typeof obj.subscriptionId !== 'number' ||
      typeof obj.portalId !== 'number' ||
      typeof obj.subscriptionType !== 'string' ||
      typeof obj.occurredAt !== 'number' ||
      typeof obj.objectId !== 'number'
    ) {
      return null;
    }
    out.push({
      eventId: obj.eventId,
      subscriptionId: obj.subscriptionId,
      portalId: obj.portalId,
      subscriptionType: obj.subscriptionType as HubspotSubscriptionType,
      occurredAt: obj.occurredAt,
      attemptNumber: typeof obj.attemptNumber === 'number' ? obj.attemptNumber : 0,
      objectId: obj.objectId,
      propertyName:
        typeof obj.propertyName === 'string' ? obj.propertyName : undefined,
      propertyValue:
        typeof obj.propertyValue === 'string' ? obj.propertyValue : undefined,
    });
  }
  return out;
}

/**
 * Group events by family for dispatcher convenience. The route handler
 * iterates one bucket at a time so a thrown handler doesn't block the
 * other event families.
 */
export interface GroupedEvents {
  deal: HubspotEvent[];
  contact: HubspotEvent[];
  engagement: HubspotEvent[];
  /** Anything we don't recognise — recorded but no-op. */
  unknown: HubspotEvent[];
}

export function groupHubspotEvents(events: HubspotEvent[]): GroupedEvents {
  const out: GroupedEvents = { deal: [], contact: [], engagement: [], unknown: [] };
  for (const ev of events) {
    if (ev.subscriptionType.startsWith('deal.')) out.deal.push(ev);
    else if (ev.subscriptionType.startsWith('contact.')) out.contact.push(ev);
    else if (ev.subscriptionType.startsWith('engagement.')) out.engagement.push(ev);
    else out.unknown.push(ev);
  }
  return out;
}

/**
 * Compact summary string for the audit log. Avoids logging
 * propertyValue when it might contain PII — that data lives in the
 * fetched HubSpot object, not in the webhook payload itself.
 */
export function summariseEvent(ev: HubspotEvent): string {
  const base = `${ev.subscriptionType} obj=${ev.objectId} portal=${ev.portalId} ev=${ev.eventId}`;
  if (ev.propertyName) return `${base} prop=${ev.propertyName}`;
  return base;
}
