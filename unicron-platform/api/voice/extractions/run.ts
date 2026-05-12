// POST /api/voice/extractions/run
//
// Runs the Claude generator + verifier on a transcript, writes the result to
// pathfinder.customer_call_extractions, and rolls up high-confidence findings
// into pathfinder.customers.facts.
//
// Translated from prototype src/app/api/extractions/run/route.ts.
//
// Stubbed dependency (out-of-scope per spec §7):
//   - signalsBridge: prototype fans extractions into pathfinder.signals as a
//     peer source. Atrium foundation skips this; signals_result returns an
//     empty no-op shape. Document in PR.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireVoiceAccess, denyResponse } from '../../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin';
import { runExtraction, buildFactsPatch } from '../../../src/lib/voice/extraction';

const BodySchema = z.object({
  transcript_id: z.string().uuid(),
  generator_model: z.string().optional(),
  verifier_model: z.string().optional(),
  auto_apply_threshold: z.number().min(0).max(1).optional(),
});

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = typeof req.body === 'string' ? safeParseJson(req.body) : req.body;
    body = BodySchema.parse(raw);
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ ok: false, error: 'bad_request', details: err.message });
    return;
  }

  const threshold = body.auto_apply_threshold ?? 0.8;
  const sb = getPathfinderServiceClient();

  // 1. Load transcript.
  const { data: transcript, error: tErr } = await sb
    .from('voice_call_transcripts')
    .select('id, customer_org_id, transcript, summary')
    .eq('id', body.transcript_id)
    .maybeSingle();
  if (tErr) { res.status(500).json({ ok: false, error: 'transcript_query_failed', details: tErr.message }); return; }
  if (!transcript) { res.status(404).json({ ok: false, error: 'transcript_not_found' }); return; }

  // 2. Run extraction.
  type ExtractionResult = Awaited<ReturnType<typeof runExtraction>>;
  let result: ExtractionResult;
  try {
    result = await runExtraction({
      transcript: (transcript as { transcript: unknown }).transcript,
      summary:    (transcript as { summary: string | null }).summary,
      generatorModel: body.generator_model,
      verifierModel:  body.verifier_model,
    });
  } catch (e) {
    const err = e as Error;
    res.status(502).json({ ok: false, error: 'extraction_failed', details: err.message });
    return;
  }

  const verifierConfidence = Math.max(0, Math.min(1, Number(result.verifier.verifier_confidence) || 0));
  const signalStrength     = Math.max(0, Math.min(1, Number(result.extraction.signal_strength) || 0));
  const customerOrgId      = (transcript as { customer_org_id: string | null }).customer_org_id;
  const shouldAutoApply    = verifierConfidence >= threshold && Boolean(customerOrgId);

  // 3. Insert extraction row.
  const { data: inserted, error: insErr } = await sb
    .from('customer_call_extractions')
    .insert({
      transcript_id:       transcript.id,
      customer_org_id:     customerOrgId,
      extracted_at:        new Date().toISOString(),
      model:               `${result.generatorModel} (verified by ${result.verifierModel})`,
      decision_makers:     result.extraction.decision_makers ?? [],
      pain_points:         result.extraction.pain_points ?? [],
      budget_signals:      result.extraction.budget_signals ?? [],
      timing_signals:      result.extraction.timing_signals ?? [],
      competitors:         result.extraction.competitors ?? [],
      next_action:         result.extraction.next_action ?? null,
      signal_strength:     signalStrength,
      verifier_confidence: verifierConfidence,
      raw_response:        { generator: result.rawGenerator, verifier: result.rawVerifier },
      review_status:       shouldAutoApply ? 'auto_applied' : 'pending',
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    res.status(500).json({ ok: false, error: 'insert_failed', details: insErr?.message ?? 'unknown' });
    return;
  }

  // 4. Optionally roll up into customers.facts.
  let appliedToCustomer = false;
  if (shouldAutoApply && customerOrgId) {
    const { data: customer, error: cErr } = await sb
      .from('customers')
      .select('id, facts')
      .eq('id', customerOrgId)
      .maybeSingle();
    if (!cErr && customer) {
      const factsPatch = buildFactsPatch(
        (customer as { facts: unknown }).facts ?? null,
        result.extraction,
        {
          transcript_id: transcript.id,
          extraction_id: inserted.id,
          confidence: verifierConfidence,
        },
      );
      const { error: uErr } = await sb
        .from('customers')
        .update({ facts: factsPatch, facts_updated_at: new Date().toISOString() })
        .eq('id', (customer as { id: string }).id);
      if (!uErr) {
        appliedToCustomer = true;
        await sb
          .from('customer_call_extractions')
          .update({ applied_to_customer_at: new Date().toISOString() })
          .eq('id', inserted.id);
      }
    }
  }

  // 5. Stubbed: signalsBridge fan-out skipped per spec §7.
  const signalsResult = { inserted: 0, errors: ['signalsBridge stubbed in foundation merge'] };

  res.status(200).json({
    ok: true,
    extraction_id: inserted.id,
    verifier_confidence: verifierConfidence,
    signal_strength: signalStrength,
    applied_to_customer: appliedToCustomer,
    customer_org_id: customerOrgId,
    extraction: result.extraction,
    verifier: result.verifier,
    signals: signalsResult,
  });
}
