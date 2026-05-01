// lib/inngest/functions/slack-alert-on-verified.ts — Phase 1 G1 Task B2.
//
// Subscribes: pathfinder/signal.verified
// Emits:     (none in v1; future: pathfinder/delivery.completed)
//
// Replaces the polling-based slack-alerts cron's high-priority detection.
// When a project crosses the verifier threshold AND its score is ≥ 90 AND
// posted_date is fresh, this function looks up the routing and posts the
// alert via lib/slack/alerts.ts.
//
// Why this is the first FULL Inngest function: it's the simplest stage to
// migrate end-to-end because slack-alerts is already a per-item delivery
// concern (not a batch reasoning step). Built-in retries fix the brittle
// fire-and-forget pattern of the cron handler — Slack API is the most
// likely transient-failure surface in the pipeline.
//
// Handler body lives in `slackAlertOnVerifiedHandler()` exported so unit
// tests can exercise it directly without going through Inngest's internal
// function wrapper machinery (which hides handlers behind private fields).

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';
import { runSlackAlertsForProject } from '@/lib/slack/alerts';
import type { Project } from '@/lib/types';

const HIGH_PRIORITY_THRESHOLD = 90;
const FRESHNESS_DAYS = 60;

export interface SignalVerifiedEventData {
  project_id: string;
  score: number;
  verifier_pass_count: number;
  verified_at: string;
}

export interface SlackAlertStepCtx {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export type SlackAlertResult =
  | { skipped: 'below_threshold'; project_id: string; score: number }
  | { skipped: 'stale'; project_id: string; ageDays: number }
  | {
      project_id: string;
      score: number;
      verified_at: string;
      outcome: 'posted' | 'no_route' | 'snoozed' | 'already_posted' | 'error';
      reason?: string;
    };

export async function slackAlertOnVerifiedHandler(
  event: { data: SignalVerifiedEventData },
  step: SlackAlertStepCtx,
): Promise<SlackAlertResult> {
  const { project_id, score, verified_at } = event.data;

  if (score < HIGH_PRIORITY_THRESHOLD) {
    return { skipped: 'below_threshold', project_id, score };
  }

  const project = await step.run('load-project', async () => {
    const sb = supabaseAdmin();
    const { data, error } = await (sb as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            single: () => Promise<{ data: Project | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single();
    if (error || !data) {
      throw new Error(`load project ${project_id}: ${error?.message ?? 'not found'}`);
    }
    return data;
  });

  if (project.posted_date) {
    const ageDays = (Date.now() - new Date(project.posted_date).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > FRESHNESS_DAYS) {
      return { skipped: 'stale', project_id, ageDays: Math.round(ageDays) };
    }
  }

  const result = await step.run('post-slack-alert', async () => {
    return runSlackAlertsForProject(project);
  });

  return {
    project_id,
    score,
    verified_at,
    outcome: result.outcome,
    reason: result.reason,
  };
}

export const slackAlertOnVerified = inngest.createFunction(
  {
    id: 'pathfinder-slack-alert-on-verified',
    name: 'Slack alert — high-priority verified projects',
    retries: 3,
    concurrency: { limit: 5 },
    triggers: [{ event: 'pathfinder/signal.verified' }],
  },
  async ({ event, step }: { event: { data: SignalVerifiedEventData }; step: unknown }) => {
    return slackAlertOnVerifiedHandler(event, step as SlackAlertStepCtx);
  },
);
