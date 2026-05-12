// lib/agents/calendar-pull.ts — Item 4 of the Atrium usefulness pass.
//
// For every team member with a stored Google Calendar refresh_token, pull
// today's + tomorrow's events into nervous_system.calendar_events. Refresh
// tokens never expire (per Google) but access tokens are short-lived; we
// mint a new access token on every run using the persisted refresh token.

import { createClient } from '@supabase/supabase-js';

interface CalendarOwner {
  member_id: string;
  email: string;
  refresh_token: string;
  calendar_id: string;
}

interface CalendarPullResult {
  status: 'ok' | 'credential_gap';
  owners: number;
  events_upserted: number;
  owners_failed: number;
}

function makeServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env not configured');
  return createClient(url, key);
}

async function mintAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('credential_gap');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`refresh_token_exchange_${res.status}: ${text.slice(0, 120)}`);
  }
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error('no_access_token_in_response');
  return json.access_token;
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
  status?: string;
}

async function fetchTodayPlusTomorrow(accessToken: string, calendarId: string): Promise<GoogleEvent[]> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 2); // through tomorrow

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set('timeMin', start.toISOString());
  url.searchParams.set('timeMax', end.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`google_calendar_list_${res.status}: ${text.slice(0, 120)}`);
  }
  const json = await res.json() as { items?: GoogleEvent[] };
  return json.items ?? [];
}

function isoFromEvent(side?: { dateTime?: string; date?: string }): string | null {
  if (!side) return null;
  if (side.dateTime) return new Date(side.dateTime).toISOString();
  if (side.date) return new Date(`${side.date}T00:00:00Z`).toISOString();
  return null;
}

export async function runCalendarPull(): Promise<CalendarPullResult> {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    console.log('[calendar-pull] credential_gap — GOOGLE_OAUTH_CLIENT_ID/SECRET unset, skipping');
    return { status: 'credential_gap', owners: 0, events_upserted: 0, owners_failed: 0 };
  }
  const sb = makeServiceSupabase();
  const { data: ownerRows, error: ownerErr } = await sb.rpc('ns_list_calendar_owners');
  if (ownerErr) throw new Error(`ns_list_calendar_owners failed: ${ownerErr.message}`);
  const owners = (ownerRows as CalendarOwner[] | null) ?? [];

  let upserted = 0;
  let failed = 0;

  for (const owner of owners) {
    try {
      const accessToken = await mintAccessToken(owner.refresh_token);
      const events = await fetchTodayPlusTomorrow(accessToken, owner.calendar_id);
      for (const ev of events) {
        if (!ev.id) continue;
        if (ev.status === 'cancelled') continue;
        const startIso = isoFromEvent(ev.start);
        if (!startIso) continue;
        const endIso = isoFromEvent(ev.end);
        const attendees = (ev.attendees ?? []).map((a) => ({
          email: a.email ?? null,
          name: a.displayName ?? null,
          response: a.responseStatus ?? null,
        }));
        const { error } = await sb.rpc('ns_upsert_calendar_event', {
          p_owner_id:          owner.member_id,
          p_external_event_id: ev.id,
          p_title:             ev.summary ?? null,
          p_start_at:          startIso,
          p_end_at:            endIso,
          p_attendees:         attendees,
          p_location:          ev.location ?? null,
          p_raw:               ev,
        });
        if (error) {
          console.error(`[calendar-pull] upsert failed for ${owner.email}/${ev.id}: ${error.message}`);
          continue;
        }
        upserted++;
      }
    } catch (err) {
      failed++;
      console.error(
        `[calendar-pull] owner=${owner.email} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { status: 'ok', owners: owners.length, events_upserted: upserted, owners_failed: failed };
}
