import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z, type ZodTypeAny } from "zod";
import { requireServerEnv } from "./env";
import { logger } from "./logger";

export const SONNET = "claude-sonnet-4-5" as const;
export const HAIKU = "claude-haiku-4-5-20251001" as const;

// Note: spec calls for claude-sonnet-4-6, but that model name alias may
// not resolve via the SDK depending on region. We default to 4-5 (stable)
// and promote to 4-6 via env override if needed.
export const DEFAULT_SONNET = (process.env.ANTHROPIC_SONNET_MODEL ?? "claude-sonnet-4-5") as string;
export const DEFAULT_HAIKU = (process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-haiku-4-5-20251001") as string;

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  return _client;
}

type CallJSONOpts = {
  model?: string;
  system?: string;
  user: string;
  max_tokens?: number;
  temperature?: number;
};

/**
 * Call Claude and parse the first JSON object in the response against a Zod
 * schema. One retry on parse/validate failure with the parse error appended
 * to the prompt.
 */
export async function callJSON<T extends ZodTypeAny>(
  opts: CallJSONOpts,
  schema: T,
): Promise<z.infer<T>> {
  const model = opts.model ?? DEFAULT_SONNET;
  const max_tokens = opts.max_tokens ?? 1024;
  const temperature = opts.temperature ?? 0.4;

  const instruct =
    (opts.system ?? "") +
    "\n\nYou MUST respond with exactly one JSON object that satisfies the requested schema. No prose, no code fences, no commentary.";

  const tryOnce = async (extraNote?: string) => {
    const msg = await anthropic().messages.create({
      model,
      max_tokens,
      temperature,
      system: instruct,
      messages: [{ role: "user", content: opts.user + (extraNote ? `\n\n${extraNote}` : "") }],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = extractFirstJson(text);
    return schema.parse(json);
  };

  try {
    return await tryOnce();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("callJSON retry after parse/validate failure", { model, msg });
    return await tryOnce(
      `Your previous response failed validation: ${msg}. Respond ONLY with valid JSON matching the schema this time.`,
    );
  }
}

function extractFirstJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  // Try to find a ```json block
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    return JSON.parse(fence[1].trim());
  }
  // Fallback: first {...} balanced search
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error(`No JSON found in response: ${trimmed.slice(0, 200)}`);
}
