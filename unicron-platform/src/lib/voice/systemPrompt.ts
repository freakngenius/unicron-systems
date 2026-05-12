/**
 * Build the runtime system prompt for an outbound call.
 *
 * The actual prompt body lives in voice_agent_sources.system_prompt (per-agent,
 * per-customer, edited in /builder). This helper just composes that body with
 * lightweight runtime context (contact name, vertical, extra notes).
 *
 * The hardcoded default is intentionally a generic fallback used only when a
 * source row exists with an empty system_prompt. Every real source ships with
 * its own prompt seeded from the builder.
 */

export const VOICE_SYSTEM_PROMPT_FALLBACK = `You are a voice agent operating on behalf of the customer that owns this source. Speak briefly, plainly, and at a natural pace. Confirm identity, state your purpose in one sentence, and pursue the agent goal defined in your assistant configuration. Never invent customers, capabilities, or numbers. If you do not know, say "I do not know, but I can find out." Wrap warmly when the conversation is complete.`;

export function buildSystemPrompt(opts?: {
  basePrompt?: string | null;
  contactName?: string;
  vertical?: string;
  extraContext?: string;
}): string {
  const base = (opts?.basePrompt && opts.basePrompt.trim().length > 0)
    ? opts.basePrompt
    : VOICE_SYSTEM_PROMPT_FALLBACK;
  const p: string[] = [base];
  if (opts?.contactName) {
    p.push(`\nCONTACT NAME: ${opts.contactName}`);
  }
  if (opts?.vertical) {
    p.push(`VERTICAL CONTEXT: ${opts.vertical}`);
  }
  if (opts?.extraContext) {
    p.push(`EXTRA CONTEXT:\n${opts.extraContext}`);
  }
  return p.join("\n");
}
