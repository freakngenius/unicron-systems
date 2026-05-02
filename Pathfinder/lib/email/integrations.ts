// lib/email/integrations.ts — Stream B Gate B2.
//
// Server-side accessors for pathfinder.email_integrations. Token columns
// are sensitive — never expose via the anon client. Public surface:
//
//   getActiveIntegration({ actorEmail, provider }) — for the send path
//   listIntegrationStatuses({ actorEmail }) — anon-safe row sans tokens
//   markDisconnected({ id }) — sets disconnected_at
//
// Token refresh is deferred to a follow-up: the access_token typically
// lasts an hour; for v1 the rep will see "reconnect" prompts when the
// send fails with 401. The schema captures refresh_token for that path.

import { supabaseAdmin } from '@/lib/supabase';
import type {
  EmailIntegration,
  EmailIntegrationStatus,
  EmailProvider,
} from '@/lib/types';

export async function getActiveIntegration(args: {
  actorEmail: string;
  provider: EmailProvider;
  accountEmail?: string | null;
}): Promise<EmailIntegration | null> {
  const admin = supabaseAdmin();
  let q = admin
    .from('email_integrations')
    .select('*')
    .eq('actor_email', args.actorEmail)
    .eq('provider', args.provider)
    .is('disconnected_at', null)
    .order('connected_at', { ascending: false })
    .limit(1);

  if (args.accountEmail) {
    q = q.eq('account_email', args.accountEmail);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`getActiveIntegration: ${error.message}`);
  }
  const rows = (data as unknown as EmailIntegration[]) ?? [];
  return rows[0] ?? null;
}

export async function listIntegrationStatuses(args: {
  actorEmail: string;
}): Promise<EmailIntegrationStatus[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('email_integrations')
    .select('actor_email,provider,account_email,connected_at,disconnected_at')
    .eq('actor_email', args.actorEmail)
    .order('connected_at', { ascending: false });
  if (error) {
    throw new Error(`listIntegrationStatuses: ${error.message}`);
  }
  return (data as unknown as EmailIntegrationStatus[]) ?? [];
}

export async function markDisconnected(args: { id: string }): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await (admin.from('email_integrations') as unknown as {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  })
    .update({ disconnected_at: new Date().toISOString() })
    .eq('id', args.id);
  if (error) {
    throw new Error(`markDisconnected: ${error.message}`);
  }
}
