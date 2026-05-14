// lib/skills/tabooKeeper.ts — Sprint 9 Stream B
//
// Wraps the existing ns_check_taboo RPC for the procedural-memory Skill
// approval flow. Calls Taboo Keeper BEFORE inserting any row into
// nervous_system.skills (Addendum 5 §5: refusal layer is primary).
//
// On allow → returns { blocked: false, taboo_check_id } so the caller can
//   carry the check id forward into the skills row insert (the write
//   trigger added by Stream A rejects writes missing taboo_check_id).
// On refuse → returns { blocked: true, reason, matched_rule }. The caller
//   MUST NOT insert.
// On RPC error → returns { blocked: true, reason } (fail closed). This is
//   consistent with HARD CONSTRAINT 2 and matches the decay-heatmap.ts /
//   agents/[id].ts patterns.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TabooCheckInput {
  /** Stable action verb, e.g. 'skill.approve' or 'skill.promote'. */
  action: string;
  /** Stable target identifier (proposed skill id or new skill name). */
  target: string;
  /** Caller identity — operator email or 'service-role' for internal. */
  actor: string;
  /** Optional structured context payload. */
  context?: Record<string, unknown>;
}

export interface TabooCheckResult {
  blocked: boolean;
  reason?: string;
  matched_rule?: string;
  /**
   * Identifier of the recorded taboo-check audit row, which the caller
   * threads into nervous_system.skills.taboo_check_id. May be undefined
   * if the RPC implementation does not surface it; the trigger added by
   * Stream A accepts any non-null uuid keyed back to the audit row.
   */
  taboo_check_id?: string;
}

export async function tabooCheckForSkillApproval(
  sb: SupabaseClient,
  input: TabooCheckInput,
): Promise<TabooCheckResult> {
  try {
    const { data, error } = await sb.rpc('ns_check_taboo', {
      p_action: input.action,
      p_target: input.target,
      p_actor: input.actor,
      p_context: JSON.stringify(input.context ?? {}),
    });
    if (error) {
      // Fail closed.
      return {
        blocked: true,
        reason: `Taboo Keeper unreachable; refusing to proceed: ${error.message}`,
      };
    }
    const result = (data ?? {}) as {
      blocked?: boolean;
      reason?: string;
      matched_rule?: string;
      check_id?: string;
      id?: string;
    };
    return {
      blocked: result.blocked === true,
      reason: result.reason,
      matched_rule: result.matched_rule,
      taboo_check_id: result.check_id ?? result.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      blocked: true,
      reason: `Taboo Keeper threw; refusing to proceed: ${msg}`,
    };
  }
}
