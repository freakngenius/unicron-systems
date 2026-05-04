// lib/inngest/functions/verifier-retry.ts — Demo Polish UX Gate 18D.
//
// Subscribes: pathfinder/verifier.retry.requested
//
// Runs a deeper Verifier pass for a single lead. Loads the latest project
// + verifier_notes, asks Claude Sonnet to generate (a) a 1-3 sentence
// failure reason in customer-facing language and (b) a 3-5 item action
// list scoped to: what data is missing, who could provide it, what
// parallel signal might confirm. Writes both back to
// pathfinder.projects so the lead detail UI can render them.
//
// Idempotent. If we still can't verify, the row stays verified=false and
// the freshly-written reason+suggestions replace the prior values.

import Anthropic from '@anthropic-ai/sdk';

import { inngest } from '../client';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const SONNET_MODEL = 'claude-sonnet-4-5';
const SONNET_MAX_TOKENS = 800;

interface VerifierRetryEvent {
  data: {
    project_id: string;
    attempt_count: number;
    requested_at: string;
  };
}

interface ProjectRowSlim {
  id: string;
  source: string;
  title: string | null;
  agency: string | null;
  description_long: string | null;
  rationale: string | null;
  pipeline_stage: string | null;
  verifier_notes: string | null;
  verified: boolean | null;
}

interface DeeperPassResult {
  failureReason: string | null;
  suggestions: string[];
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

function safeParseJson(input: string): { failureReason?: string; suggestions?: string[] } | null {
  // Tolerate fenced code blocks. Trim and strip ```...``` if present.
  let s = input.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  }
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // fall through
  }
  return null;
}

async function runDeeperPass(project: ProjectRowSlim): Promise<DeeperPassResult> {
  const promptParts = [
    'You are the Pathfinder Verifier running a deeper pass on an unverified lead.',
    'Output STRICT JSON: {"failureReason": string, "suggestions": string[]}.',
    'failureReason is 1-3 sentences in customer-facing language describing the SPECIFIC reason verification fails.',
    'suggestions is 3-5 actionable next steps. Each step names: missing data, who could provide it, or a parallel signal that might confirm.',
    'No markdown, no preamble, no fences. JSON only.',
    '',
    `Project ID: ${project.id}`,
    `Source: ${project.source}`,
    `Title: ${project.title ?? '(none)'}`,
    `Agency / Owner: ${project.agency ?? '(none)'}`,
    `Pipeline stage: ${project.pipeline_stage ?? '(unknown)'}`,
    `Description: ${(project.description_long ?? '').slice(0, 800) || '(none)'}`,
    `Rationale: ${(project.rationale ?? '').slice(0, 600) || '(none)'}`,
    `Verifier notes: ${project.verifier_notes ?? '(none)'}`,
  ];

  const message = await client().messages.create({
    model: SONNET_MODEL,
    max_tokens: SONNET_MAX_TOKENS,
    messages: [{ role: 'user', content: promptParts.join('\n') }],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n');

  const parsed = safeParseJson(text);
  if (!parsed) {
    return {
      failureReason:
        'Unable to confirm scope from available source data. The deeper pass returned an unparseable response.',
      suggestions: [
        'Re-run the deeper pass after the next ingestor cycle (raw_payload may refresh).',
        'Cross-reference adjacent SAM.gov / USAspending records for the same agency.',
      ],
    };
  }

  const reason =
    typeof parsed.failureReason === 'string' && parsed.failureReason.trim().length > 0
      ? parsed.failureReason.trim()
      : null;
  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions = rawSuggestions
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 5);

  return { failureReason: reason, suggestions };
}

export const verifierRetry = inngest.createFunction(
  {
    id: 'pathfinder-verifier-retry',
    name: 'Verifier deeper pass (Gate 18D)',
    retries: 2,
    triggers: [{ event: 'pathfinder/verifier.retry.requested' }],
  },
  async ({ event, step }: { event: VerifierRetryEvent; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };

    const project = await stepCtx.run('load-project', async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(
          'id, source, title, agency, description_long, rationale, pipeline_stage, verifier_notes, verified',
        )
        .eq('id', event.data.project_id)
        .maybeSingle();
      if (error || !data) throw new Error(`project_not_found:${event.data.project_id}`);
      return data as unknown as ProjectRowSlim;
    });

    const result = await stepCtx.run('deeper-pass', async () => runDeeperPass(project));

    await stepCtx.run('persist', async () => {
      const update = {
        verifier_failure_reason: result.failureReason,
        verifier_suggestions: result.suggestions,
      };
      const res = await (
        supabaseAdmin().from('projects') as unknown as {
          update: (v: typeof update) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .update(update)
        .eq('id', event.data.project_id);
      if (res.error) throw new Error(res.error.message);
    });

    return {
      project_id: event.data.project_id,
      attempt_count: event.data.attempt_count,
      suggestions_count: result.suggestions.length,
      had_reason: result.failureReason !== null,
    };
  },
);
