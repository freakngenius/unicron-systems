// lib/inngest/events.ts — Phase 1 G1 Task B1/B2.
//
// Typed event schema for the agent-pipeline orchestration bus per D2
// (cron for source polling + Inngest for agent pipeline orchestration).
//
// Spec: SPEC - Backend Architecture.md §4 (event topology). The event
// names match the spec verbatim with a `pathfinder/` namespace prefix
// to keep the Inngest workspace shareable across future apps in the
// `unicron-systems` repo.

export type PathfinderEvents = {
  /**
   * A new raw_event landed in pathfinder.projects from the ingestor.
   * Subscribed by the qualifier-rank workflow (folded Qualifier per D6).
   */
  'pathfinder/raw_event.created': {
    name: 'pathfinder/raw_event.created';
    data: {
      project_id: string;
      source: string;
      ingested_at: string;
    };
  };

  /**
   * A project passed the qualifier (score >= threshold). Subscribed by
   * verifier and the parallel research-tier agents (Phase 2: enricher,
   * adjacency, competitive — out of G1 scope but the contract is here
   * so Phase 2 streams can subscribe without a contract change).
   */
  'pathfinder/signal.qualified': {
    name: 'pathfinder/signal.qualified';
    data: {
      project_id: string;
      score: number;
      qualified_at: string;
    };
  };

  /**
   * A project failed the qualifier. Subscribed by observability /
   * tuning agents (Phase 2 Pulse). Also useful for cost-of-rejection
   * dashboards.
   */
  'pathfinder/signal.rejected': {
    name: 'pathfinder/signal.rejected';
    data: {
      project_id: string;
      score: number | null;
      rejected_at: string;
      reason: string | null;
    };
  };

  /**
   * A project passed the Verifier (verifier_pass_count crossed the
   * threshold). Subscribed by outreach drafter, slack-alert dispatcher,
   * and (Phase 2) hubspot-pre-stamp.
   */
  'pathfinder/signal.verified': {
    name: 'pathfinder/signal.verified';
    data: {
      project_id: string;
      score: number;
      verifier_pass_count: number;
      verified_at: string;
    };
  };

  /**
   * Verifier escalated a project (e.g. failed twice). Subscribed by the
   * Architect Inbox (Phase 2 Stream D) for human-assist proposal generation.
   */
  'pathfinder/signal.escalated': {
    name: 'pathfinder/signal.escalated';
    data: {
      project_id: string;
      pass_count: number;
      escalated_at: string;
      flags: string[];
    };
  };

  /**
   * Outreach drafter produced a draft for a verified project. Subscribed
   * by the delivery dispatcher fan-out.
   */
  'pathfinder/decision.synthesized': {
    name: 'pathfinder/decision.synthesized';
    data: {
      project_id: string;
      draft_id: number | null;
      synthesized_at: string;
    };
  };

  /**
   * A delivery channel posted/sent successfully. Subscribed by
   * observability + the reinforcement-loop sink (Phase 2 Sales Agent
   * Counterpart).
   */
  'pathfinder/delivery.completed': {
    name: 'pathfinder/delivery.completed';
    data: {
      project_id: string;
      channel: 'slack' | 'email' | 'hubspot' | 'dashboard';
      delivered_at: string;
      reference_id: string | null;
    };
  };
};
