// lib/connectors/slack/signature.ts — thin façade over lib/slack/bot.ts's
// signature verification. Kept here so connector-route handlers don't
// need to import from the Phase-1 slack module path; the verifier itself
// is identical (same v0 HMAC scheme).

import { verifySlackSignature as verify, type VerifySlackSignatureResult } from '@/lib/slack/bot';

export interface VerifySlackRequestArgs {
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  body: string;
}

/**
 * Returns ok=true only when SLACK_SIGNING_SECRET is set AND the request's
 * v0 signature matches the body. The "secret-not-set" case returns
 * ok=false with reason='missing_signature' so handlers fail closed by
 * default — never accept unsigned traffic, even in dev.
 */
export function verifySlackRequest(args: VerifySlackRequestArgs): VerifySlackSignatureResult {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    return { ok: false, reason: 'missing_signature' };
  }
  return verify({ ...args, secret });
}
