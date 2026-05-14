// lib/skills/supabase.ts — Sprint 9 Stream B
//
// Service-role Supabase client + nervous_system schema accessor for the
// new Skills API. Reads are scoped at the app layer via explicit customer_id
// filters; writes pass through the taboo_check_id trigger added by Stream A.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getSkillsServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns a query builder scoped to nervous_system.skills.
 * Service role bypasses RLS — every caller MUST filter customer_id
 * explicitly when callerCustomerId is non-null (per Addendum 5 §3).
 */
export function skillsTable(sb: SupabaseClient) {
  return sb.schema('nervous_system').from('skills');
}

export function proposedSkillsTable(sb: SupabaseClient) {
  return sb.schema('nervous_system').from('proposed_skills');
}

export function skillInvocationsTable(sb: SupabaseClient) {
  return sb.schema('nervous_system').from('skill_invocations');
}
