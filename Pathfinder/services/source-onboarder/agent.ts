// services/source-onboarder/agent.ts
//
// Source Onboarder agent runtime. Drives SPEC §6 decision tree.
//
// Implementation note: see services/source-onboarder/types.ts header — the
// agent is a deterministic state machine, not a Claude Agent SDK loop.
// Drift documented in MEMORY/decisions.md.
//
// Cost-discipline (SPEC §9):
//   - Anthropic Sonnet calls capped at 8 / session
//   - webFetch capped at 30 / session
//   - Wall-clock capped at 30 minutes
//   - On overrun → human-assist ticket regardless of progress

import {
  classifySource,
  webFetch,
  inferSchema,
  findDefaultAdapterForKind,
  runTestFetch,
  deployAdapter,
  deployDataSource,
  createHumanAssistTicket,
  parseJson,
  parseXml,
} from './tools';
import { parseFeed } from '@/lib/adapters/rss';
import { getAdapter, type AdapterRuntimeConfig, type AdapterKind } from '@/lib/adapters';
import { createSession, finalizeSession } from './session';
import type {
  SourceOnboarderInput,
  SourceOnboarderResult,
  OnboarderSession,
} from './types';

const COST_CAP_USD = 0.5;             // SPEC §9
const WEB_FETCH_CAP = 30;
const WALL_CLOCK_CAP_MS = 30 * 60 * 1000;
const TEST_FETCH_MIN_RECORDS = 5;
const ADAPTER_REGEN_MAX = 3;          // SPEC §6 step 5

export interface OnboarderRunOptions {
  inputs: SourceOnboarderInput;
}

export async function runSourceOnboarder(opts: OnboarderRunOptions): Promise<SourceOnboarderResult> {
  const { inputs } = opts;
  const session = await createSession({
    goal: inputs.url ?? inputs.description ?? 'unknown source',
    input: inputs as unknown as Record<string, unknown>,
    agentRole: 'source-onboarder',
    createdByUserEmail: inputs.created_by_user_email ?? null,
  });

  let webFetchCount = 0;
  const checkBudget = (): { over: boolean; reason: string } => {
    if (Date.now() - session.startedAt > WALL_CLOCK_CAP_MS) {
      return { over: true, reason: 'time_overrun' };
    }
    if (session.costUsd > COST_CAP_USD) {
      return { over: true, reason: 'cost_overrun' };
    }
    if (webFetchCount > WEB_FETCH_CAP) {
      return { over: true, reason: 'web_fetch_cap_exceeded' };
    }
    return { over: false, reason: '' };
  };

  try {
    const url = inputs.url;
    if (!url) {
      return finalize({
        session,
        outcome: 'human-assist',
        status: 'needs_assist',
        reason: 'natural-language description provided without URL — manual triage required',
        ticket: await createHumanAssistTicket({
          candidateUrl: 'unknown',
          blockedReason: 'format_unrecognized',
          blockedDetail: inputs.description ?? '',
          whatHumanNeedsToDo: 'Identify a fetchable URL or upload a sample file for the described source.',
          agentSessionId: session.id,
        }),
      });
    }

    // 1) Classify ---------------------------------------------------------
    session.log({ kind: 'classify', message: `classifying ${url}`, data: { url, hint: inputs.hint } });
    const tier1Hint = inputs.hint && inputs.hint !== 'custom' ? inputs.hint : undefined;
    const { classification, sample } = await classifySource(url, { hint: tier1Hint });
    session.toolCalls += 1;
    webFetchCount += 1;
    session.log({
      kind: 'classify',
      message: `classification → ${classification.kind}`,
      data: { classification, contentType: sample?.contentType },
    });

    if (classification.kind === 'tier_3') {
      return finalize({
        session,
        outcome: 'declined',
        status: 'failed',
        reason: `tier_3: ${classification.reason}`,
      });
    }
    if (classification.kind === 'tier_2') {
      return finalize({
        session,
        outcome: 'human-assist',
        status: 'needs_assist',
        reason: `tier_2: ${classification.reason}`,
        ticket: await createHumanAssistTicket({
          candidateUrl: url,
          blockedReason: classification.reason,
          blockedDetail: `Classification routed to Tier 2: ${classification.reason}. ` +
            `Sample content-type: ${sample?.contentType ?? 'unknown'}.`,
          whatHumanNeedsToDo: tier2Instruction(classification.reason),
          partialProgress: { classification, sample },
          agentSessionId: session.id,
        }),
      });
    }

    const adapterKind: AdapterKind = classification.kind;

    // 2) Sample-fetch + schema infer -------------------------------------
    const adapter = getAdapter(adapterKind);
    const baseConfig: AdapterRuntimeConfig = {
      endpoint: url,
      jurisdiction: inputs.jurisdiction ?? jurisdictionGuess(url),
      page_size: 25,
      api_key_env: inputs.api_key_env,
    };
    session.log({ kind: 'fetch', message: 'running sample fetch', data: { adapterKind } });
    const probe = await runTestFetch(adapter, baseConfig, { maxRecords: TEST_FETCH_MIN_RECORDS });
    session.toolCalls += 1;
    webFetchCount += 1;

    if (!probe.ok || probe.events.length === 0) {
      const ticket = await createHumanAssistTicket({
        candidateUrl: url,
        blockedReason: 'format_unrecognized',
        blockedDetail: `Default ${adapterKind} adapter could not produce events. Errors: ${probe.errors.slice(0, 3).join('; ')}`,
        whatHumanNeedsToDo: 'Inspect endpoint shape; if a custom field map is needed, write a per-source config in lib/adapters or generate a custom adapter.',
        partialProgress: { rawCount: probe.rawCount, errors: probe.errors, classification },
        agentSessionId: session.id,
      });
      return finalize({
        session,
        outcome: 'human-assist',
        status: 'needs_assist',
        reason: `default adapter failed: ${probe.errors.slice(0, 1).join('') || 'no events extracted'}`,
        ticket,
      });
    }
    session.log({
      kind: 'parse',
      message: `extracted ${probe.events.length} events (raw ${probe.rawCount})`,
      data: { firstId: probe.events[0]?.source_event_id, durationMs: probe.durationMs },
    });

    // 3) Schema infer ----------------------------------------------------
    const rawSamples: unknown[] = probe.events.map((e) => e.metadata).slice(0, 10);
    const schema = inferSchema(rawSamples);
    session.toolCalls += 1;
    session.log({ kind: 'infer_schema', message: `inferred ${Object.keys(schema.fields).length} fields`, data: { schema } });

    // 4) Reuse default adapter ------------------------------------------
    session.log({ kind: 'search_adapters', message: `looking for ${adapterKind}-default adapter row` });
    let adapterRow = await findDefaultAdapterForKind(adapterKind);
    session.toolCalls += 1;
    if (!adapterRow) {
      session.log({ kind: 'deploy', message: `creating ${adapterKind}-default adapter row` });
      const created = await deployAdapter({
        kind: adapterKind,
        name: `${adapterKind}-default`,
        generatedCode: null,
        schemaInferred: schema as unknown as Record<string, unknown>,
        sampleRecords: rawSamples.slice(0, 3),
        generatedBySessionId: session.id,
      });
      session.toolCalls += 1;
      adapterRow = {
        id: created.id,
        kind: adapterKind,
        name: `${adapterKind}-default`,
        version: '0.1.0',
        generated_code: null,
        test_pass_count: 0,
        test_fail_count: 0,
        promoted_trusted: false,
      };
    }

    const overrun = checkBudget();
    if (overrun.over) {
      session.log({ kind: 'cost_check', message: `budget overrun: ${overrun.reason}` });
      return finalize({
        session,
        outcome: 'human-assist',
        status: 'timed_out',
        reason: overrun.reason,
        ticket: await createHumanAssistTicket({
          candidateUrl: url,
          blockedReason: overrun.reason as 'cost_overrun' | 'time_overrun' | 'other',
          blockedDetail: `Onboarding hit ${overrun.reason} during ${classification.kind} probe.`,
          whatHumanNeedsToDo: 'Review session reasoning_log to decide whether to extend cap or refine input.',
          partialProgress: { schema, classification },
          agentSessionId: session.id,
        }),
      });
    }

    // 5) Deploy data_source -------------------------------------------
    const sourceName = guessName(url, adapterKind);
    session.log({ kind: 'deploy', message: `deploying data_source '${sourceName}'` });
    const dataSource = await deployDataSource({
      name: sourceName,
      description: inputs.description ?? null,
      candidateUrl: url,
      adapterKind,
      adapterId: adapterRow.id,
      jurisdiction: baseConfig.jurisdiction ?? null,
      pollFrequencySeconds: inputs.poll_frequency_seconds ?? 1800,
      config: baseConfig,
      metadata: {
        classification,
        schema_fields: Object.keys(schema.fields),
        sample_count: probe.rawCount,
      },
      createdByUserEmail: inputs.created_by_user_email ?? null,
    });
    session.toolCalls += 1;
    session.log({
      kind: 'deploy',
      message: `data_source deployed (${dataSource.id})`,
      data: { sourceId: dataSource.id },
    });

    return finalize({
      session,
      outcome: 'live',
      status: 'succeeded',
      sourceId: dataSource.id,
      adapterId: adapterRow.id,
      adapterKind,
      schema: schema as unknown as Record<string, unknown>,
      firstEventAt: probe.events[0]?.timestamp,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    session.log({ kind: 'note', message: `unexpected error: ${reason}` });
    let ticketId: string | undefined;
    try {
      const ticket = await createHumanAssistTicket({
        candidateUrl: opts.inputs.url ?? 'unknown',
        blockedReason: 'other',
        blockedDetail: `Unexpected onboarder error: ${reason}`,
        whatHumanNeedsToDo: 'Investigate the agent_session reasoning_log; rerun if transient or escalate if structural.',
        agentSessionId: session.id,
      });
      ticketId = ticket.ticketId;
    } catch {
      // tickets are best-effort
    }
    return finalize({
      session,
      outcome: 'human-assist',
      status: 'failed',
      reason,
      ticket: ticketId ? { ticketId } : undefined,
    });
  }
}

// ----- helpers ----------------------------------------------------------

interface FinalizeArgs {
  session: OnboarderSession;
  outcome: 'live' | 'queued' | 'human-assist' | 'declined';
  status: 'succeeded' | 'failed' | 'needs_assist' | 'timed_out';
  sourceId?: string;
  adapterId?: string;
  adapterKind?: AdapterKind;
  schema?: Record<string, unknown>;
  firstEventAt?: string;
  reason?: string;
  ticket?: { ticketId: string };
}

async function finalize(args: FinalizeArgs): Promise<SourceOnboarderResult> {
  const result: SourceOnboarderResult = {
    outcome: args.outcome,
    source_id: args.sourceId,
    adapter_id: args.adapterId,
    adapter_kind: args.adapterKind,
    schema: args.schema,
    first_event_at: args.firstEventAt,
    ticket_id: args.ticket?.ticketId,
    reason: args.reason,
    session_id: args.session.id,
    cost_usd: args.session.costUsd,
    duration_ms: Date.now() - args.session.startedAt,
    reasoning_log: args.session.steps,
  };

  await finalizeSession({
    session: args.session,
    status: args.status,
    outcome: {
      outcome: args.outcome,
      reason: args.reason ?? null,
      source_id: args.sourceId ?? null,
      adapter_id: args.adapterId ?? null,
      ticket_id: args.ticket?.ticketId ?? null,
      adapter_kind: args.adapterKind ?? null,
      first_event_at: args.firstEventAt ?? null,
    },
  });
  return result;
}

function tier2Instruction(reason: 'js_rendering' | 'auth_required' | 'pdf_inconsistent' | 'format_unrecognized'): string {
  switch (reason) {
    case 'js_rendering':
      return 'Page is JS-rendered. Capture rendered HTML via headless browser snapshot, or supply an underlying API endpoint, then re-run onboarder with that URL.';
    case 'auth_required':
      return 'Source requires authentication. Provide an API key (set api_key_env) or session credentials, then re-run onboarder.';
    case 'pdf_inconsistent':
      return 'Source publishes inconsistent PDFs. Phase 2 PDF parsing path is post-Tier-1; capture sample PDFs and consider supplying a normalized JSON dump URL if available.';
    default:
      return 'Inspect URL response shape and either supply a more specific format hint or capture a sample dataset for manual onboarding.';
  }
}

function jurisdictionGuess(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m = host.match(/^(?:data|opendata|api)\.([a-z]+)\.([a-z]{2})\./);
    if (m) return `${m[2].toUpperCase()}-${m[1]}`;
    if (host.includes('sam.gov') || host.includes('usaspending')) return 'federal';
    if (host.endsWith('.ny.gov')) return 'NY';
    if (host.endsWith('.ca.gov')) return 'CA';
    if (host.endsWith('.tx.gov')) return 'TX';
  } catch { /* ignore */ }
  return 'unknown';
}

function guessName(url: string, kind: AdapterKind): string {
  try {
    const u = new URL(url);
    const slug = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
    return `${u.hostname.replace(/[^a-z0-9]+/gi, '-')}::${slug.replace(/\.[a-z]+$/i, '')}`.slice(0, 80);
  } catch {
    return `source-${kind}-${Date.now()}`;
  }
}

// Re-export consumed for tests
export { parseJson, parseXml, parseFeed };
