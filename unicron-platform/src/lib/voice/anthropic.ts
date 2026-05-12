/**
 * Minimal Anthropic client. fetch-based, no SDK dependency.
 * Returns parsed text content from the first message block.
 */

const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";

export type ClaudeOpts = {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
};

export async function callClaude(opts: ClaudeOpts): Promise<{ text: string; raw: any }> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.2,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }]
  };
  const res = await fetch(ANTHROPIC_BASE, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? `Anthropic HTTP ${res.status}`;
    throw new Error(msg);
  }
  const text = Array.isArray(json?.content)
    ? json.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
    : "";
  return { text, raw: json };
}

/** Extract the first JSON object/array from a string that may include prose or fences. */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  // Strip code fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  // Try direct parse.
  try {
    return JSON.parse(candidate) as T;
  } catch { /* fall through */ }
  // Bracket scan.
  const first = candidate.search(/[\{\[]/);
  if (first < 0) return null;
  const open = candidate[first];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = first; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(first, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}
