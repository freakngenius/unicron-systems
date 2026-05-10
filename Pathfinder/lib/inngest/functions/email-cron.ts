// lib/inngest/functions/email-cron.ts — Sprint 5 Stream A
//
// Daily email ingest cron.
// Schedule: 08:00 PT = 16:00 UTC  →  "0 16 * * *"
//
// Fetches the last 24 hours of Gmail messages for kyle@unicron.systems
// using OAuth2 refresh-token flow, then delegates to the ingestEmail skill.
// Results are logged to nervous_system.audit_log.
//
// Env vars required (Vercel project → Environment Variables):
//   GMAIL_CLIENT_ID            — Google OAuth2 client ID
//   GMAIL_CLIENT_SECRET        — Google OAuth2 client secret
//   GMAIL_REFRESH_TOKEN_KYLE   — refresh token for kyle@unicron.systems
//
// If any env var is missing the account is skipped gracefully.

import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import type { EmailMessage, IngestEmailResult } from '@/lib/ingest/skills/ingest-email';

// ─── Gmail OAuth2 helpers ─────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

async function getGmailAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const json = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !json.access_token) {
    console.error('[email-cron] Gmail token refresh failed', {
      status: res.status,
      error: json.error,
      description: json.error_description,
    });
    return null;
  }
  return json.access_token;
}

// ─── Gmail message fetch helpers ──────────────────────────────────────────

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMessagePayload {
  headers?: { name: string; value: string }[];
  parts?: GmailMessagePart[];
  body?: { data?: string };
  mimeType?: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  payload?: GmailMessagePayload;
  snippet?: string;
}

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload: GmailMessagePayload): string {
  // Prefer text/plain part
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse for nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody({ parts: part.parts } as GmailMessagePayload);
        if (nested) return nested;
      }
    }
  }
  // Fall back to top-level body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return '';
}

function getHeader(payload: GmailMessagePayload, name: string): string {
  const header = payload.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? '';
}

async function fetchGmailMessages(
  accessToken: string,
  since: Date
): Promise<EmailMessage[]> {
  const dateStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`;
  const query = `after:${dateStr}`;

  // List message IDs
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', '100'); // 100 is the Gmail API cap per page

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => '<unreadable>');
    console.error('[email-cron] Gmail list messages failed', {
      status: listRes.status,
      body: text,
    });
    return [];
  }

  const listJson = (await listRes.json()) as GmailListResponse;
  const messageIds = listJson.messages ?? [];

  if (messageIds.length === 0) return [];

  // Fetch each message's full payload (in parallel, batched 10 at a time)
  const messages: EmailMessage[] = [];
  const batchSize = 10;

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const fetched = await Promise.all(
      batch.map(async ({ id }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) return null;
        return (await msgRes.json()) as GmailMessage;
      })
    );

    for (const gmailMsg of fetched) {
      if (!gmailMsg || !gmailMsg.payload) continue;

      const payload = gmailMsg.payload;
      const subject = getHeader(payload, 'Subject') || '(no subject)';
      const from = getHeader(payload, 'From') || '';
      const to = getHeader(payload, 'To') || '';
      const date = getHeader(payload, 'Date') || new Date().toISOString();
      const listUnsubscribe = getHeader(payload, 'List-Unsubscribe');

      // Parse date header to ISO
      let isoDate: string;
      try {
        isoDate = new Date(date).toISOString();
      } catch {
        isoDate = new Date().toISOString();
      }

      const body = extractBody(payload) || gmailMsg.snippet || '';

      messages.push({
        message_id: gmailMsg.id,
        subject,
        from,
        to,
        date: isoDate,
        body,
        has_list_unsubscribe: listUnsubscribe.length > 0,
      });
    }
  }

  return messages;
}

// ─── Audit log helper ─────────────────────────────────────────────────────

async function writeAuditLog(
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[email-cron] Supabase env vars missing — skipping audit log write');
    return;
  }

  const sb = createClient(url, key, {
    db: { schema: 'nervous_system' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sbAny = sb as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };

  try {
    await sbAny.from('audit_log').insert({ action, payload });
  } catch (err) {
    console.warn('[email-cron] audit_log write failed (non-fatal)', err);
  }
}

// ─── Inngest function ─────────────────────────────────────────────────────

export const emailDailyCron = inngest.createFunction(
  {
    id: 'nervous-system-email-daily-ingest',
    name: 'Nervous System — email daily ingest',
    retries: 1,
    // 08:00 PT = 16:00 UTC
    triggers: [{ cron: 'TZ=UTC 0 16 * * *' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };

    const cronResult = await stepCtx.run('ingest-gmail-kyle', async () => {
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const refreshToken = process.env.GMAIL_REFRESH_TOKEN_KYLE;

      if (!clientId || !clientSecret || !refreshToken) {
        console.warn(
          '[email-cron] Gmail env vars missing for kyle@unicron.systems — skipping',
          {
            has_client_id: !!clientId,
            has_client_secret: !!clientSecret,
            has_refresh_token: !!refreshToken,
          }
        );
        return { account: 'kyle@unicron.systems', skipped: true, reason: 'env vars missing' };
      }

      // 1. Obtain access token
      const accessToken = await getGmailAccessToken(clientId, clientSecret, refreshToken);
      if (!accessToken) {
        return {
          account: 'kyle@unicron.systems',
          skipped: true,
          reason: 'token refresh failed',
        };
      }

      // 2. Fetch messages from the last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const messages = await fetchGmailMessages(accessToken, since);

      // 3. Run ingest skill
      const { ingestEmail } = await import('@/lib/ingest/skills/ingest-email');
      const ingestResult: IngestEmailResult = await ingestEmail({
        messages,
        captured_by: { type: 'agent', id: 'email-cron' },
      });

      // 4. Audit log
      await writeAuditLog('email_cron_run', {
        account: 'kyle@unicron.systems',
        since: since.toISOString(),
        messages_fetched: messages.length,
        ...ingestResult,
      });

      return {
        account: 'kyle@unicron.systems',
        messages_fetched: messages.length,
        ...ingestResult,
      };
    });

    return { run_at: new Date().toISOString(), accounts: [cronResult] };
  }
);
