/**
 * Call-transcript extraction: generator + verifier.
 *
 * Generator: reads transcript, returns structured findings (decision_makers,
 * pain_points, budget_signals, timing_signals, competitors, next_action,
 * signal_strength).
 *
 * Verifier: re-reads transcript + generator output, returns
 * verifier_confidence (0-1) and per-field validity flags. If the verifier's
 * confidence is high, the caller may auto-apply facts to the customer row.
 */

import { callClaude, extractJson } from "./anthropic";

export type ExtractionResult = {
  decision_makers: Array<{ name?: string; title?: string; note?: string }>;
  pain_points: Array<{ topic: string; quote?: string; severity?: "low" | "med" | "high" }>;
  budget_signals: Array<{ value?: string; quote?: string }>;
  timing_signals: Array<{ value?: string; quote?: string }>;
  competitors: Array<{ name: string; quote?: string }>;
  next_action: string | null;
  signal_strength: number; // 0..1
};

export type VerifierResult = {
  verifier_confidence: number; // 0..1
  notes?: string;
  per_field_valid?: Record<string, boolean>;
};

const GENERATOR_SYSTEM = `You extract structured B2B discovery signals from voice-call transcripts.

Rules:
- Output STRICT JSON only. No prose, no code fences.
- Quote spans must be verbatim substrings from the transcript when provided.
- If a category has no evidence, return an empty array (or null for next_action).
- signal_strength is your overall read of how useful this call was for qualifying the lead, on 0..1.
- Never invent names, dollar amounts, dates, or competitor names that are not in the transcript.

JSON shape:
{
  "decision_makers": [ { "name": "...", "title": "...", "note": "..." } ],
  "pain_points":     [ { "topic": "...", "quote": "...", "severity": "low|med|high" } ],
  "budget_signals":  [ { "value": "...", "quote": "..." } ],
  "timing_signals":  [ { "value": "...", "quote": "..." } ],
  "competitors":     [ { "name": "...", "quote": "..." } ],
  "next_action": "string or null",
  "signal_strength": 0.0
}`;

const VERIFIER_SYSTEM = `You verify a previously generated extraction against the original transcript.

Rules:
- Output STRICT JSON only. No prose, no code fences.
- For each top-level field, mark whether the generator's claim is fully supported by the transcript (no hallucinations, quotes are real).
- verifier_confidence is your overall confidence the extraction is faithful, on 0..1. If anything is hallucinated, drop confidence below 0.6.

JSON shape:
{
  "verifier_confidence": 0.0,
  "notes": "brief reasoning",
  "per_field_valid": {
    "decision_makers": true,
    "pain_points": true,
    "budget_signals": true,
    "timing_signals": true,
    "competitors": true,
    "next_action": true
  }
}`;

function transcriptToText(transcript: any): string {
  if (!transcript) return "";
  if (typeof transcript === "string") return transcript;
  const turns: any[] = Array.isArray(transcript)
    ? transcript
    : Array.isArray(transcript?.turns)
      ? transcript.turns
      : [];
  if (turns.length === 0) {
    try { return JSON.stringify(transcript); } catch { return ""; }
  }
  return turns
    .map((t) => {
      const role = (t.role ?? t.speaker ?? "user").toString();
      const text = (t.text ?? t.message ?? t.transcript ?? "").toString().trim();
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export type RunExtractionArgs = {
  transcript: any;       // jsonb from voice_call_transcripts
  summary?: string | null;
  generatorModel?: string;
  verifierModel?: string;
};

export type RunExtractionOutput = {
  extraction: ExtractionResult;
  verifier: VerifierResult;
  rawGenerator: any;
  rawVerifier: any;
  generatorModel: string;
  verifierModel: string;
};

const EMPTY_EXTRACTION: ExtractionResult = {
  decision_makers: [],
  pain_points: [],
  budget_signals: [],
  timing_signals: [],
  competitors: [],
  next_action: null,
  signal_strength: 0
};

export async function runExtraction(args: RunExtractionArgs): Promise<RunExtractionOutput> {
  const generatorModel = args.generatorModel ?? "claude-sonnet-4-5-20250929";
  const verifierModel = args.verifierModel ?? "claude-haiku-4-5-20251001";

  const text = transcriptToText(args.transcript);
  const userBlock = `TRANSCRIPT:\n${text || "(empty)"}\n\n${
    args.summary ? `OPERATOR SUMMARY:\n${args.summary}\n` : ""
  }`;

  // 1. Generator.
  const gen = await callClaude({
    model: generatorModel,
    systemPrompt: GENERATOR_SYSTEM,
    userPrompt: userBlock,
    temperature: 0.2,
    maxTokens: 2048
  });
  const extraction = extractJson<ExtractionResult>(gen.text) ?? EMPTY_EXTRACTION;

  // 2. Verifier.
  const ver = await callClaude({
    model: verifierModel,
    systemPrompt: VERIFIER_SYSTEM,
    userPrompt: `${userBlock}\n\nGENERATED_EXTRACTION:\n${JSON.stringify(extraction, null, 2)}`,
    temperature: 0,
    maxTokens: 600
  });
  const verifier = extractJson<VerifierResult>(ver.text) ?? {
    verifier_confidence: 0,
    notes: "verifier returned non-JSON"
  };

  return {
    extraction,
    verifier,
    rawGenerator: gen.raw,
    rawVerifier: ver.raw,
    generatorModel,
    verifierModel
  };
}

/**
 * Merge an extraction's findings into customers.facts.
 * Each fact entry: { value, last_seen_at, source_table, source_id, confidence }
 * facts shape (top-level): { decision_makers: [...], pain_points: [...], ... }
 */
export function buildFactsPatch(
  current: Record<string, any> | null,
  extraction: ExtractionResult,
  source: { transcript_id: string; extraction_id: string; confidence: number }
): Record<string, any> {
  const now = new Date().toISOString();
  const next: Record<string, any> = { ...(current ?? {}) };
  const stamp = (value: any) => ({
    value,
    last_seen_at: now,
    source_table: "customer_call_extractions",
    source_id: source.extraction_id,
    transcript_id: source.transcript_id,
    confidence: source.confidence
  });
  const appendUnique = (key: string, items: any[]) => {
    const existing: any[] = Array.isArray(next[key]) ? next[key] : [];
    const seen = new Set(existing.map((e) => JSON.stringify(e.value ?? e)));
    const toAdd = items
      .map(stamp)
      .filter((entry) => !seen.has(JSON.stringify(entry.value)));
    next[key] = [...existing, ...toAdd];
  };
  appendUnique("decision_makers", extraction.decision_makers ?? []);
  appendUnique("pain_points",     extraction.pain_points ?? []);
  appendUnique("budget_signals",  extraction.budget_signals ?? []);
  appendUnique("timing_signals",  extraction.timing_signals ?? []);
  appendUnique("competitors",     extraction.competitors ?? []);
  if (extraction.next_action) {
    next.next_action = stamp(extraction.next_action);
  }
  return next;
}
