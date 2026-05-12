/**
 * Vapi adapter. Builds the assistant config for an outbound call.
 *
 * Stack (locked decisions):
 * - Voice: ElevenLabs (NOT Vapi defaults). Boardy unlock.
 * - LLM: Anthropic Claude 3.5 Sonnet, temperature 0.85.
 * - STT: Deepgram Nova-3.
 * - Endpointing: 700ms wait. Patient. Avoids early-Boardy interruption.
 */

import { providerForModel } from "./llmCatalog.js";

const VAPI_BASE = "https://api.vapi.ai";

export type FirstMessageMode =
  | "assistant-speaks-first"
  | "assistant-waits-for-user"
  | "assistant-speaks-first-with-model-generated-message";

export type VapiAssistantOpts = {
  systemPrompt: string;
  firstMessage: string;
  firstMessageMode?: FirstMessageMode;
  voiceId: string;
  voiceModel: string;
  llmModel: string;
  temperature: number;
  endpointingWaitSeconds: number;
  /** ElevenLabs voice settings. All optional with reasonable defaults. */
  voiceStability?: number;
  voiceSimilarityBoost?: number;
  voiceStyle?: number;
  voiceSpeed?: number;
  voiceUseSpeakerBoost?: boolean;
};

export type AssistantBuildExtras = {
  serverUrl?: string;
  serverSecret?: string;
};

export function buildAssistantPayload(opts: VapiAssistantOpts, extras?: AssistantBuildExtras) {
  const llmProvider = providerForModel(opts.llmModel);
  const payload: any = {
    name: "Unicron Voice Prototype",
    firstMessage: opts.firstMessage,
    firstMessageMode: opts.firstMessageMode ?? "assistant-speaks-first",
    model: {
      provider: llmProvider,
      model: opts.llmModel,
      temperature: opts.temperature,
      maxTokens: 350,
      messages: [{ role: "system", content: opts.systemPrompt }]
    },
    voice: {
      provider: "11labs",
      voiceId: opts.voiceId,
      model: opts.voiceModel,
      stability: opts.voiceStability ?? 0.5,
      similarityBoost: opts.voiceSimilarityBoost ?? 0.75,
      style: opts.voiceStyle ?? 0.0,
      speed: opts.voiceSpeed ?? 1.0,
      useSpeakerBoost: opts.voiceUseSpeakerBoost ?? true
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en",
      smartFormat: true
    },
    startSpeakingPlan: {
      waitSeconds: opts.endpointingWaitSeconds,
      smartEndpointingPlan: { provider: "vapi" }
    },
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 360,
    backgroundSound: "off",
    backchannelingEnabled: false,
    backgroundDenoisingEnabled: true,
    modelOutputInMessagesEnabled: true,
    serverMessages: [
      "transcript",
      "status-update",
      "end-of-call-report",
      "hang",
      "speech-update"
    ]
  };
  if (extras?.serverUrl) {
    payload.server = { url: extras.serverUrl };
    if (extras.serverSecret) payload.server.secret = extras.serverSecret;
  }
  return payload;
}

export type PlaceCallArgs = {
  apiKey: string;
  phoneNumberId: string;
  toPhone: string;
  /** When provided, use a persistent assistant by id and pass overrides per call. */
  assistantId?: string;
  /** When assistantId is not set, send a transient assistant payload. */
  assistant?: ReturnType<typeof buildAssistantPayload>;
  /** Variables for prompt/firstMessage substitution. */
  variables?: Record<string, string>;
  metadata: Record<string, unknown>;
};

export async function placeOutboundCall(args: PlaceCallArgs) {
  const body: any = {
    phoneNumberId: args.phoneNumberId,
    customer: { number: args.toPhone }
  };
  if (args.assistantId) {
    body.assistantId = args.assistantId;
    body.assistantOverrides = {
      metadata: args.metadata,
      ...(args.variables && Object.keys(args.variables).length > 0
        ? { variableValues: args.variables }
        : {})
    };
  } else if (args.assistant) {
    body.assistant = args.assistant;
    body.assistantOverrides = { metadata: args.metadata };
  }
  const res = await fetch(`${VAPI_BASE}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: json };
}

/**
 * Fetch a single Vapi call by id. Used by the cost reconciler to backfill
 * cost / costBreakdown / orgId for transcripts that never received an
 * end-of-call-report (or received it before we added those columns).
 */
export async function getVapiCall(apiKey: string, callId: string) {
  const res = await fetch(`${VAPI_BASE}/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: json };
}

/**
 * List Vapi calls. Supports time-range filters and assistantId scoping.
 * Used by the account spend rollup. The API caps at 1000 per page.
 */
export async function listVapiCalls(
  apiKey: string,
  opts: {
    assistantId?: string;
    createdAtGe?: string;
    createdAtLe?: string;
    limit?: number;
  } = {}
) {
  const q = new URLSearchParams();
  if (opts.assistantId) q.set("assistantId", opts.assistantId);
  if (opts.createdAtGe) q.set("createdAtGe", opts.createdAtGe);
  if (opts.createdAtLe) q.set("createdAtLe", opts.createdAtLe);
  q.set("limit", String(Math.min(opts.limit ?? 1000, 1000)));
  const res = await fetch(`${VAPI_BASE}/call?${q.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: json as any[] | null };
}
