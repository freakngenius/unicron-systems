/**
 * Vapi-supported LLM catalog.
 * Each entry maps a model id to the Vapi `provider` value used in assistant.model.provider.
 * Curated list of popular/current models across providers Vapi supports.
 * Reference: https://docs.vapi.ai/providers/model
 */

export type VapiProvider = "anthropic" | "openai" | "google" | "groq" | "xai";

export type LlmModelEntry = {
  id: string;        // Vapi model id (sent as model.model)
  label: string;     // human label in dropdown
  provider: VapiProvider;
};

export const LLM_CATALOG: { provider: VapiProvider; label: string; models: LlmModelEntry[] }[] = [
  {
    provider: "anthropic",
    label: "Anthropic",
    models: [
      { id: "claude-haiku-4-5-20251001",   label: "Claude Haiku 4.5",       provider: "anthropic" },
      { id: "claude-sonnet-4-5-20250929",  label: "Claude Sonnet 4.5",      provider: "anthropic" },
      { id: "claude-sonnet-4-6",           label: "Claude Sonnet 4.6",      provider: "anthropic" },
      { id: "claude-opus-4-5-20251101",    label: "Claude Opus 4.5",        provider: "anthropic" },
      { id: "claude-opus-4-6",             label: "Claude Opus 4.6",        provider: "anthropic" },
      { id: "claude-3-7-sonnet-20250219",  label: "Claude 3.7 Sonnet",      provider: "anthropic" },
      { id: "claude-3-5-sonnet-20241022",  label: "Claude 3.5 Sonnet (oct)", provider: "anthropic" },
      { id: "claude-3-5-haiku-20241022",   label: "Claude 3.5 Haiku",       provider: "anthropic" }
    ]
  },
  {
    provider: "openai",
    label: "OpenAI",
    models: [
      { id: "gpt-4o",         label: "GPT-4o",         provider: "openai" },
      { id: "gpt-4o-mini",    label: "GPT-4o mini",    provider: "openai" },
      { id: "gpt-4.1",        label: "GPT-4.1",        provider: "openai" },
      { id: "gpt-4.1-mini",   label: "GPT-4.1 mini",   provider: "openai" },
      { id: "gpt-4-turbo",    label: "GPT-4 Turbo",    provider: "openai" }
    ]
  },
  {
    provider: "google",
    label: "Google",
    models: [
      { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    provider: "google" },
      { id: "gemini-2.5-flash",  label: "Gemini 2.5 Flash",  provider: "google" },
      { id: "gemini-2.0-flash",  label: "Gemini 2.0 Flash",  provider: "google" },
      { id: "gemini-1.5-pro",    label: "Gemini 1.5 Pro",    provider: "google" }
    ]
  },
  {
    provider: "groq",
    label: "Groq",
    models: [
      { id: "llama-3.3-70b-versatile",  label: "Llama 3.3 70B (Groq)",  provider: "groq" },
      { id: "llama-3.1-8b-instant",     label: "Llama 3.1 8B (Groq)",   provider: "groq" }
    ]
  },
  {
    provider: "xai",
    label: "xAI",
    models: [
      { id: "grok-3",       label: "Grok 3",       provider: "xai" },
      { id: "grok-3-mini",  label: "Grok 3 mini",  provider: "xai" }
    ]
  }
];

// Flat id -> provider map for fast lookup.
const FLAT: Record<string, VapiProvider> = (() => {
  const out: Record<string, VapiProvider> = {};
  for (const group of LLM_CATALOG) {
    for (const m of group.models) out[m.id] = m.provider;
  }
  return out;
})();

export function providerForModel(modelId: string): VapiProvider {
  // Direct hit.
  if (FLAT[modelId]) return FLAT[modelId];
  // Heuristic fallback for legacy values.
  const id = modelId.toLowerCase();
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3")) return "openai";
  if (id.startsWith("gemini")) return "google";
  if (id.startsWith("grok")) return "xai";
  if (id.startsWith("llama") || id.includes("mixtral")) return "groq";
  // Safe default.
  return "anthropic";
}

export function isKnownModel(modelId: string): boolean {
  return Boolean(FLAT[modelId]);
}

export const DEFAULT_LLM_MODEL = "claude-haiku-4-5-20251001";
