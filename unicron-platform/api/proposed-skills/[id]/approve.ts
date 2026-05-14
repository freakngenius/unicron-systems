// api/proposed-skills/[id]/approve.ts — Sprint 9 Stream B
//
// POST /api/proposed-skills/:id/approve — promote a proposed Skill to
// nervous_system.skills. Per Addendum 5 §5 (refusal layer is primary),
// Taboo Keeper MUST be called FIRST. Only on allow do we insert the
// skills row carrying the taboo_check_id (the write trigger added by
// Stream A rejects writes missing it).
//
// Transaction-style flow:
//   1. Fetch proposed_skills row by id; assert status='queued'.
//   2. Call Taboo Keeper with the proposed_skill payload.
//   3a. On refuse → append taboo_flags on the proposal row, keep status,
//       respond 403 with refusal reason. No skill row created.
//   3b. On allow → insert skills row with lifecycle_status='approved',
//       version, parent_skill_id, author_kind, taboo_check_id, etc.
//       Update proposal row to status='approved', reviewed_by/at.
//   4. If skills insert fails, the trigger fires and rejects; we surface
//       the error and the proposal stays queued.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSkillsAuth, type AuthOutcome } from '../../../lib/skills/auth.js';
import {
  getSkillsServiceClient,
  proposedSkillsTable,
  skillsTable,
} from '../../../lib/skills/supabase.js';
import { tabooCheckForSkillApproval } from '../../../lib/skills/tabooKeeper.js';

interface ProposalRow {
  id: string;
  proposed_skill: Record<string, unknown>;
  customer_id: string | null;
  source_run_id: string;
  status: string;
  taboo_flags: unknown[] | null;
}

function actorIdentity(auth: AuthOutcome): string {
  if (!auth.ok) return 'unknown';
  if (auth.mode === 'session' && auth.email) return auth.email;
  return 'service-role';
}

async function appendTabooFlag(
  sb: SupabaseClient,
  proposalId: string,
  current: unknown[] | null,
  flag: Record<string, unknown>,
): Promise<void> {
  const arr = Array.isArray(current) ? [...current, flag] : [flag];
  try {
    await proposedSkillsTable(sb)
      .update({ taboo_flags: arr as unknown as object })
      .eq('id', proposalId);
  } catch {
    /* non-fatal */
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-unicron-api-key');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const auth = await checkSkillsAuth(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ ok: false, error: 'id is required' });
    return;
  }

  let sb: SupabaseClient;
  try {
    sb = getSkillsServiceClient();
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  // 1. Fetch + assert queued.
  const { data: proposalData, error: proposalErr } = await proposedSkillsTable(sb)
    .select('id,proposed_skill,customer_id,source_run_id,status,taboo_flags')
    .eq('id', id)
    .maybeSingle();
  if (proposalErr) {
    res.status(500).json({ ok: false, error: proposalErr.message });
    return;
  }
  if (!proposalData) {
    res.status(404).json({ ok: false, error: 'proposed skill not found' });
    return;
  }
  const proposal = proposalData as ProposalRow;
  if (proposal.status !== 'queued') {
    res.status(409).json({
      ok: false,
      error: `proposal cannot be approved: status=${proposal.status}`,
    });
    return;
  }

  const proposedSkill = proposal.proposed_skill ?? {};
  const proposedName = (proposedSkill as { name?: string }).name;
  if (!proposedName || typeof proposedName !== 'string') {
    res.status(400).json({
      ok: false,
      error: 'proposed_skill.name is required to promote to skills table',
    });
    return;
  }

  // 2. Taboo Keeper FIRST.
  const taboo = await tabooCheckForSkillApproval(sb, {
    action: 'skill.approve',
    target: `proposed_skill/${proposal.id}`,
    actor: actorIdentity(auth),
    context: {
      proposed_skill: proposedSkill,
      customer_id: proposal.customer_id,
      source_run_id: proposal.source_run_id,
    },
  });

  if (taboo.blocked) {
    await appendTabooFlag(sb, proposal.id, proposal.taboo_flags, {
      flagged_at: new Date().toISOString(),
      reason: taboo.reason,
      matched_rule: taboo.matched_rule ?? null,
      actor: actorIdentity(auth),
    });
    res.status(403).json({
      ok: false,
      blocked: true,
      reason: taboo.reason ?? 'Taboo Keeper refused the promotion',
      matched_rule: taboo.matched_rule ?? null,
    });
    return;
  }

  // 3. Insert skills row carrying taboo_check_id.
  const ps = proposedSkill as Record<string, unknown>;
  const insertPayload: Record<string, unknown> = {
    ...ps,
    lifecycle_status: 'approved',
    customer_id: proposal.customer_id,
    source_run_id: proposal.source_run_id,
    author_kind: ps.author_kind ?? 'skill_forge',
    taboo_check_id: taboo.taboo_check_id ?? null,
    approved_by: auth.mode === 'session' ? null : null, // resolved server-side from team_members; left null for service-role insertions
    approved_at: new Date().toISOString(),
  };

  // Carry parent_skill_id + version if the proposal already has them
  // (Skill Forge versioning path); otherwise default to version 1.
  if (typeof ps.version !== 'number') insertPayload.version = 1;

  const { data: insertedData, error: insertErr } = await skillsTable(sb)
    .insert(insertPayload)
    .select(
      'id,name,version,lifecycle_status,status,customer_id,taboo_check_id,created_at',
    )
    .single();

  if (insertErr) {
    res.status(500).json({
      ok: false,
      error: `skills insert failed: ${insertErr.message}`,
      taboo_check_id: taboo.taboo_check_id ?? null,
    });
    return;
  }

  const inserted = insertedData as { id: string; name: string; version: number };

  // 4. Mark proposal approved.
  const { error: updateErr } = await proposedSkillsTable(sb)
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      // reviewed_by remains null for service-role calls; session callers
      // are resolved server-side once team_members lookup is wired (out
      // of scope for Sprint 9 Stream B).
    })
    .eq('id', proposal.id);

  res.status(200).json({
    ok: true,
    proposed_skill_id: proposal.id,
    skill: inserted,
    taboo_check_id: taboo.taboo_check_id ?? null,
    proposal_update_warning: updateErr ? updateErr.message : undefined,
  });
}
