// api/skills/[id]/invoke.ts — Sprint 9 Stream B
//
// POST /api/skills/:id/invoke — thin pass-through to the existing tool
// runner at /api/atrium/skills/run. Sprint 9 does NOT implement
// execute_skill semantics; that lands in Sprint 11 (Addendum 7).
//
// Behavior:
//   1. Look up the Skill row by id, verify lifecycle/status and decay.
//   2. Insert a nervous_system.skill_invocations row with status='running'.
//   3. Call the existing /api/atrium/skills/run handler in-process,
//      passing { skill_slug: <name>, ...inputs }.
//   4. In a try/finally, update the invocation row to succeeded|failed|refused
//      with outputs, latency_ms, refusal_reason as appropriate.
//
// Body: arbitrary JSON payload — forwarded to the tool runner as the
// invocation inputs. The Skill's `name` is used as `skill_slug` for the
// passthrough (Sprint 5 run.ts is name/slug-keyed).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSkillsAuth } from '../../../lib/skills/auth.js';
import {
  getSkillsServiceClient,
  skillsTable,
  skillInvocationsTable,
} from '../../../lib/skills/supabase.js';
import runHandler from '../../atrium/skills/run.js';

interface SkillRowLite {
  id: string;
  name: string;
  version: number;
  customer_id: string | null;
  lifecycle_status: string;
  status: string;
  decay_at: string | null;
}

type CallerKind = 'orchestrator' | 'agent' | 'human' | 'cron';

interface InvokeBody {
  caller_kind?: CallerKind;
  caller_id?: string;
  inputs?: Record<string, unknown>;
}

interface CapturedResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function captureRes(): { res: VercelResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 200, body: null, headers: {} };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    setHeader(k: string, v: string) {
      captured.headers[k.toLowerCase()] = String(v);
      return this;
    },
    json(b: unknown) {
      captured.body = b;
      return this;
    },
    send(b: unknown) {
      captured.body = b;
      return this;
    },
    end() {
      return this;
    },
  } as unknown as VercelResponse;
  return { res, captured };
}

async function startInvocation(
  sb: SupabaseClient,
  skill: SkillRowLite,
  callerKind: CallerKind,
  callerId: string | undefined,
  inputs: Record<string, unknown>,
): Promise<{ id: string | null }> {
  try {
    const { data, error } = await skillInvocationsTable(sb)
      .insert({
        skill_id: skill.id,
        skill_version: skill.version,
        caller_kind: callerKind,
        caller_id: callerId ?? null,
        customer_id: skill.customer_id,
        inputs: inputs as unknown as object,
        status: 'running',
      })
      .select('id')
      .single();
    if (error || !data) return { id: null };
    return { id: (data as { id: string }).id };
  } catch {
    return { id: null };
  }
}

async function finishInvocation(
  sb: SupabaseClient,
  invocationId: string,
  patch: {
    status: 'succeeded' | 'failed' | 'refused';
    outputs?: unknown;
    refusal_reason?: string | null;
    latency_ms: number;
  },
): Promise<void> {
  try {
    await skillInvocationsTable(sb)
      .update({
        status: patch.status,
        outputs: (patch.outputs ?? null) as unknown as object,
        refusal_reason: patch.refusal_reason ?? null,
        latency_ms: patch.latency_ms,
        finished_at: new Date().toISOString(),
      })
      .eq('id', invocationId);
  } catch {
    // Non-fatal — invocation row not closed.
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

  const body = (req.body ?? {}) as InvokeBody;
  const inputs = (body.inputs ?? {}) as Record<string, unknown>;
  const callerKind: CallerKind = body.caller_kind ?? 'human';
  const callerId = body.caller_id;

  let sb: SupabaseClient;
  try {
    sb = getSkillsServiceClient();
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const { data, error } = await skillsTable(sb)
    .select('id,name,version,customer_id,lifecycle_status,status,decay_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ ok: false, error: 'skill not found' });
    return;
  }
  const skill = data as SkillRowLite;

  if (skill.lifecycle_status !== 'approved') {
    res.status(409).json({
      ok: false,
      error: `skill not invocable: lifecycle_status=${skill.lifecycle_status}`,
    });
    return;
  }
  if (skill.status === 'deprecated') {
    res.status(409).json({ ok: false, error: 'skill is deprecated' });
    return;
  }
  if (skill.decay_at && new Date(skill.decay_at).getTime() < Date.now()) {
    res.status(409).json({ ok: false, error: 'skill has decayed past its decay_at horizon' });
    return;
  }

  const startedAt = Date.now();
  const { id: invocationId } = await startInvocation(sb, skill, callerKind, callerId, inputs);

  try {
    const passthroughReq = {
      method: 'POST',
      headers: req.headers,
      query: {},
      body: { skill_slug: skill.name, ...inputs, params: inputs },
    } as unknown as VercelRequest;

    const { res: capturedRes, captured } = captureRes();
    await runHandler(passthroughReq, capturedRes);

    const latency = Date.now() - startedAt;
    const upstreamBody = (captured.body ?? {}) as Record<string, unknown>;
    const upstreamOk =
      captured.status >= 200 &&
      captured.status < 300 &&
      (upstreamBody.ok === undefined || upstreamBody.ok === true);

    let finalStatus: 'succeeded' | 'failed' | 'refused' = upstreamOk ? 'succeeded' : 'failed';
    let refusalReason: string | null = null;
    if (
      typeof upstreamBody.error === 'string' &&
      /taboo|refus/i.test(upstreamBody.error)
    ) {
      finalStatus = 'refused';
      refusalReason = upstreamBody.error;
    }

    if (invocationId) {
      await finishInvocation(sb, invocationId, {
        status: finalStatus,
        outputs: upstreamBody,
        refusal_reason: refusalReason,
        latency_ms: latency,
      });
    }

    res.status(captured.status).json({
      ok: upstreamOk,
      skill_id: skill.id,
      skill_name: skill.name,
      skill_version: skill.version,
      invocation_id: invocationId,
      latency_ms: latency,
      result: upstreamBody,
    });
  } catch (err) {
    const latency = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    if (invocationId) {
      await finishInvocation(sb, invocationId, {
        status: 'failed',
        outputs: { error: msg },
        latency_ms: latency,
      });
    }
    res.status(500).json({ ok: false, error: msg, invocation_id: invocationId });
  }
}
