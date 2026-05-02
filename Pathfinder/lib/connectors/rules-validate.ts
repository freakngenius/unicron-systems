// lib/connectors/rules-validate.ts — input validation for routing rules.
//
// Splits the validation logic out of the route handlers so the modal can
// use the same checks client-side and fail fast before a POST. The same
// helpers are used in tests/connectors-ui to drive the modal behavior.
//
// SECURITY NOTES:
//  - filter_json is stored as `jsonb` (not text) so SQL injection through
//    the filter expression is impossible by construction.
//  - channel_id is constrained to a printable-character whitelist to
//    block SSRF-style payloads (newlines, control chars, full URLs).
//  - event_type is checked against the static EVENT_TYPE_IDS allowlist.

import { EVENT_TYPE_IDS } from './events';

export interface RoutingRuleInput {
  event_type: string;
  channel_id: string;
  channel_name?: string | null;
  filter_json?: unknown;
  quiet_hours_json?: unknown;
}

export interface QuietHours {
  weekdays_enabled: boolean;
  weekends_enabled: boolean;
  start_hour_utc: number; // 0-23
  end_hour_utc: number; // 0-23
}

export interface ValidationError {
  field: string;
  message: string;
}

const CHANNEL_ID_PATTERN = /^[A-Za-z0-9_#@.\-]{1,80}$/;

export function validateRoutingRule(input: unknown): {
  ok: boolean;
  errors: ValidationError[];
  value?: {
    event_type: string;
    channel_id: string;
    channel_name: string | null;
    filter_json: Record<string, unknown>;
    quiet_hours_json: Record<string, unknown> | null;
  };
} {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: '_root', message: 'Body must be a JSON object.' }] };
  }

  const event_type = typeof input.event_type === 'string' ? input.event_type.trim() : '';
  if (!event_type) {
    errors.push({ field: 'event_type', message: 'Pick an event type.' });
  } else if (!EVENT_TYPE_IDS.includes(event_type)) {
    errors.push({ field: 'event_type', message: `Unknown event type "${event_type}".` });
  }

  const channel_id = typeof input.channel_id === 'string' ? input.channel_id.trim() : '';
  if (!channel_id) {
    errors.push({ field: 'channel_id', message: 'Channel is required.' });
  } else if (!CHANNEL_ID_PATTERN.test(channel_id)) {
    errors.push({
      field: 'channel_id',
      message: 'Channel can only contain letters, numbers, #, @, _, -, .',
    });
  }

  const channel_name =
    typeof input.channel_name === 'string' && input.channel_name.trim().length > 0
      ? input.channel_name.trim().slice(0, 200)
      : null;

  // filter_json: accept undefined (default {}), object, or a JSON string.
  // Strings are parsed and re-validated; we never pass through raw text
  // to the DB so jsonb is the only path on success.
  let filter_json: Record<string, unknown> = {};
  if (input.filter_json !== undefined && input.filter_json !== null) {
    if (typeof input.filter_json === 'string') {
      try {
        const parsed = JSON.parse(input.filter_json);
        if (!isRecord(parsed)) {
          errors.push({ field: 'filter_json', message: 'Filter must be a JSON object.' });
        } else {
          filter_json = parsed;
        }
      } catch (err) {
        errors.push({
          field: 'filter_json',
          message: `Filter is not valid JSON: ${(err as Error).message}`,
        });
      }
    } else if (isRecord(input.filter_json)) {
      filter_json = input.filter_json;
    } else {
      errors.push({ field: 'filter_json', message: 'Filter must be a JSON object.' });
    }
  }

  // quiet_hours_json: accept null/undefined (no quiet hours) or an object
  // that conforms to QuietHours (either typed or coerced from numeric
  // strings the client may send).
  let quiet_hours_json: Record<string, unknown> | null = null;
  if (
    input.quiet_hours_json !== undefined &&
    input.quiet_hours_json !== null &&
    !(typeof input.quiet_hours_json === 'string' && input.quiet_hours_json.trim() === '')
  ) {
    const qh = parseQuietHours(input.quiet_hours_json);
    if (qh.errors.length) {
      errors.push(...qh.errors);
    } else if (qh.value) {
      quiet_hours_json = {
        weekdays_enabled: qh.value.weekdays_enabled,
        weekends_enabled: qh.value.weekends_enabled,
        start_hour_utc: qh.value.start_hour_utc,
        end_hour_utc: qh.value.end_hour_utc,
      };
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      event_type,
      channel_id,
      channel_name,
      filter_json,
      quiet_hours_json,
    },
  };
}

function parseQuietHours(input: unknown): {
  errors: ValidationError[];
  value: QuietHours | null;
} {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      return {
        errors: [{ field: 'quiet_hours_json', message: `Invalid JSON: ${(err as Error).message}` }],
        value: null,
      };
    }
  }
  if (!isRecord(raw)) {
    return {
      errors: [{ field: 'quiet_hours_json', message: 'Quiet hours must be an object.' }],
      value: null,
    };
  }
  const start = numericField(raw.start_hour_utc);
  const end = numericField(raw.end_hour_utc);
  const errors: ValidationError[] = [];
  if (start === null || start < 0 || start > 23) {
    errors.push({ field: 'start_hour_utc', message: 'Start hour must be 0–23.' });
  }
  if (end === null || end < 0 || end > 23) {
    errors.push({ field: 'end_hour_utc', message: 'End hour must be 0–23.' });
  }
  if (errors.length) return { errors, value: null };
  return {
    errors: [],
    value: {
      weekdays_enabled: raw.weekdays_enabled !== false,
      weekends_enabled: Boolean(raw.weekends_enabled),
      start_hour_utc: start as number,
      end_hour_utc: end as number,
    },
  };
}

function numericField(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
