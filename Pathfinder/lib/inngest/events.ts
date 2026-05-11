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

  /**
   * Operator (or Coverage Expansion Agent) requested onboarding of a new
   * source. Subscribed by the Source Onboarder Inngest function (Phase 2
   * Stream E). Returned payload is a SourceOnboarderResult.
   */
  'pathfinder/source.onboard.requested': {
    name: 'pathfinder/source.onboard.requested';
    data: {
      kind: 'url' | 'docs_link' | 'rss' | 'file' | 'description';
      url?: string;
      description?: string;
      hint?: 'socrata' | 'rest' | 'rss' | 'json-dump';
      jurisdiction?: string;
      poll_frequency_seconds?: number;
      api_key_env?: string;
      created_by_user_email?: string;
      request_id?: string;
    };
  };

  /**
   * Operator created a coverage goal; pre-flight estimate should run.
   * Subscribed by coverage-expansion-estimate (Phase 2 Stream E, Gate E2).
   */
  'pathfinder/coverage.estimate.requested': {
    name: 'pathfinder/coverage.estimate.requested';
    data: { goal_id: string };
  };

  /**
   * Operator approved a coverage estimate; dispatch loop should start.
   * Subscribed by coverage-expansion-run.
   */
  'pathfinder/coverage.run.requested': {
    name: 'pathfinder/coverage.run.requested';
    data: { goal_id: string };
  };

  /**
   * Customer (or operator) clicked "Attempt Verification" on an unverified
   * lead. The Verifier deeper-pass function picks this up, refetches the
   * latest source data, re-runs the four checks, and writes
   * verifier_failure_reason + verifier_suggestions back when it still
   * can't verify. Gate 18D.
   */
  'pathfinder/verifier.retry.requested': {
    name: 'pathfinder/verifier.retry.requested';
    data: {
      project_id: string;
      attempt_count: number;
      requested_at: string;
    };
  };

  /**
   * Per-org ingest dispatch (Phase 2C slice 1). The ingest-all-orgs cron
   * lists active organizations and emits one event per org carrying the
   * resolved architecture so downstream agent slices (ranker, outreach,
   * verifier) can pick up org-scoped work without re-fetching per agent.
   *
   * Slice 1 emits this event but no subscriber consumes it yet — that
   * lands in slice 2 when the ranker dispatcher comes online. The event
   * shape is stable so downstream slices subscribe without contract
   * churn.
   */
  'pathfinder/org.ingest_requested': {
    name: 'pathfinder/org.ingest_requested';
    data: {
      organization_id: string;
      slug: string;
      trigger: 'cron' | 'on-demand' | 'first-run';
      requested_at: string;
    };
  };
};
