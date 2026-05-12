/**
 * Per-agent allowlist enforcement.
 *
 * Modes (column voice_agent_sources.allowlist_mode):
 *   - 'allowlist' (default): callee must be in env VOICE_ALLOWLIST AND in the
 *       source's allowlist_phones array. Hardest safety net.
 *   - 'hubspot':   callee must match a HubSpot contact (optionally filtered by
 *       pipeline/stage in hubspot_filter). env VOICE_ALLOWLIST is still
 *       enforced as a global kill-switch unless empty.
 *   - 'open':      callee only needs valid E.164 format. env VOICE_ALLOWLIST
 *       is still enforced as a global kill-switch unless empty. Requires
 *       an explicit open_mode_confirmed_at timestamp on the source row.
 *
 * The env allowlist (VOICE_ALLOWLIST) is a global circuit breaker that overrides
 * everything. Set it on Vercel during dev/staging; leave empty to disable.
 */
import { phoneInHubspotFilter } from "./hubspot.js";

export function normalizeE164(input: string): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "";
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : "";
}

export function envAllowlist(): string[] {
  const raw = process.env.VOICE_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((s) => normalizeE164(s))
    .filter((s) => s.length > 0);
}

export type AllowCheck =
  | { ok: true; phone: string; mode: "allowlist" | "hubspot" | "open" }
  | {
      ok: false;
      phone: string;
      mode: "allowlist" | "hubspot" | "open";
      reason: string;
    };

export type SourceLike = {
  allowlist_mode?: string | null;
  allowlist_phones?: string[] | null;
  hubspot_filter?: any;
  open_mode_confirmed_at?: string | null;
};

export async function assertAllowlistedForSource(
  toPhoneRaw: string,
  source: SourceLike
): Promise<AllowCheck> {
  const mode = (source.allowlist_mode ?? "allowlist") as
    | "allowlist"
    | "hubspot"
    | "open";
  const phone = normalizeE164(toPhoneRaw);
  if (!phone || phone === "+") {
    return { ok: false, phone, mode, reason: "invalid phone format" };
  }

  // Global circuit breaker. If VOICE_ALLOWLIST is set, callee must be in it
  // regardless of mode. Leave empty to disable in production.
  const env = envAllowlist();
  if (env.length > 0 && !env.includes(phone)) {
    return {
      ok: false,
      phone,
      mode,
      reason: "phone not in global VOICE_ALLOWLIST"
    };
  }

  if (mode === "allowlist") {
    const src = (source.allowlist_phones ?? []).map(normalizeE164);
    if (src.length === 0) {
      return {
        ok: false,
        phone,
        mode,
        reason: "agent allowlist is empty"
      };
    }
    if (!src.includes(phone)) {
      return {
        ok: false,
        phone,
        mode,
        reason: "phone not in agent allowlist"
      };
    }
    return { ok: true, phone, mode };
  }

  if (mode === "hubspot") {
    const result = await phoneInHubspotFilter(phone, source.hubspot_filter);
    if (!result.ok) {
      return { ok: false, phone, mode, reason: result.reason };
    }
    return { ok: true, phone, mode };
  }

  if (mode === "open") {
    if (!source.open_mode_confirmed_at) {
      return {
        ok: false,
        phone,
        mode,
        reason: "open mode not confirmed for this agent"
      };
    }
    return { ok: true, phone, mode };
  }

  return { ok: false, phone, mode, reason: `unknown allowlist_mode: ${mode}` };
}

/** Legacy synchronous check kept for backwards compat. Mirrors the old
 *  assertAllowlisted but operates only on the env + array list. The dispatcher
 *  has migrated to assertAllowlistedForSource. */
export function assertAllowlisted(
  toPhoneRaw: string,
  sourceAllowlist: string[]
):
  | { ok: true; phone: string }
  | { ok: false; phone: string; reason: string } {
  const phone = normalizeE164(toPhoneRaw);
  if (!phone || phone === "+") {
    return { ok: false, phone, reason: "invalid phone format" };
  }
  const env = envAllowlist();
  if (env.length > 0 && !env.includes(phone)) {
    return { ok: false, phone, reason: "phone not in env allowlist" };
  }
  const src = (sourceAllowlist ?? []).map(normalizeE164);
  if (!src.includes(phone)) {
    return { ok: false, phone, reason: "phone not in source allowlist" };
  }
  return { ok: true, phone };
}
