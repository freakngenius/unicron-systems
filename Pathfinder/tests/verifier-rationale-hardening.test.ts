// tests/verifier-rationale-hardening.test.ts — Z-D #8 (narratable rationale)
//
// The verifier's rationale-accuracy check already grounds dollar / location /
// customer / operational anchors against raw_payload (see app/api/cron/
// verifier/route.ts). Z-D Wave 3 added a deterministic owner / GC anchor
// grounding step so a hallucinated owner mention can't slip into the
// dashboard or outreach draft.
//
// This file exercises the pure helper `checkOwnerAnchors` directly. The
// integration of "rewrite rationale to placeholder when pass_count >= 1"
// is exercised by __tests__/api/cron/verifier.test.ts (which already runs
// the route end-to-end against a live Supabase).
//
// Coverage:
//   1. known-good rationale (owner mention resolves) → no flagged anchors
//   2. hallucinated owner (mention not in raw_payload) → flagged
//   3. multi-mention rationale: subset resolves, subset flags
//   4. empty rationale / empty payload → trivial pass
//   5. payload nests owner under USAspending's `award` key → still resolves
//   6. SAM-style payload with "Recipient Name" key → resolves

import { describe, expect, it } from 'vitest';

import { checkOwnerAnchors } from '@/lib/verifier-owner-check';

describe('Z-D #8 · checkOwnerAnchors (rationale owner-anchor grounding)', () => {
  it('passes when the owner mention resolves to a payload field', () => {
    const rationale =
      'Strong fit for Phoenix branch. The owner is Acme Builders Inc, a customer Zedcor has served before.';
    const payload = { owner_name: 'Acme Builders Inc' };
    const out = checkOwnerAnchors(rationale, payload);
    expect(out.mentioned.length).toBeGreaterThan(0);
    expect(out.flagged).toEqual([]);
    expect(out.resolved.length).toBeGreaterThan(0);
  });

  it('flags a hallucinated owner mention not present in raw_payload', () => {
    const rationale =
      'Project owner is Phantom Construction Group, a developer Zedcor has worked with.';
    const payload = { owner_name: 'Acme Builders Inc' };
    const out = checkOwnerAnchors(rationale, payload);
    expect(out.flagged.length).toBeGreaterThan(0);
    expect(out.resolved).toEqual([]);
  });

  it('partially flags when one mention resolves and another does not', () => {
    const rationale =
      'Owner is Acme Builders Inc. Prime contractor is Phantom GC LLC.';
    const payload = { owner_name: 'Acme Builders Inc' };
    const out = checkOwnerAnchors(rationale, payload);
    expect(out.resolved.length).toBeGreaterThan(0);
    expect(out.flagged.length).toBeGreaterThan(0);
    // The phantom GC must appear in `flagged`.
    expect(out.flagged.some((f) => f.includes('phantom'))).toBe(true);
  });

  it('returns trivial pass when rationale is empty', () => {
    expect(checkOwnerAnchors('', { owner_name: 'Acme' })).toEqual({
      mentioned: [],
      resolved: [],
      flagged: [],
    });
  });

  it('returns trivial pass when raw_payload is null', () => {
    // No payload, no mentions means trivial pass.
    expect(checkOwnerAnchors('a generic rationale with no owner mention', null)).toEqual({
      mentioned: [],
      resolved: [],
      flagged: [],
    });
  });

  it('grounds owner mention against USAspending-style nested `award` key', () => {
    const rationale = 'Awarded to Tier One Defense Inc, a long-time prime.';
    const payload = {
      award: {
        recipient_name: 'Tier One Defense Inc',
      },
    };
    const out = checkOwnerAnchors(rationale, payload);
    expect(out.flagged).toEqual([]);
    expect(out.resolved.length).toBeGreaterThan(0);
  });

  it('grounds against the SAM.gov "Recipient Name" key', () => {
    const rationale = 'Recipient Northrop Grumman Systems posted this notice.';
    const payload = { 'Recipient Name': 'Northrop Grumman Systems' };
    const out = checkOwnerAnchors(rationale, payload);
    expect(out.flagged).toEqual([]);
    expect(out.resolved.length).toBeGreaterThan(0);
  });

  it('does not false-flag a rationale with no owner-shaped cue phrase', () => {
    const rationale =
      'High-value $42M lighting refresh at the Pittsburgh metro near the I-376 corridor.';
    const payload = {};
    const out = checkOwnerAnchors(rationale, payload);
    expect(out.mentioned).toEqual([]);
    expect(out.flagged).toEqual([]);
  });

  it('handles single-word owner candidates (too noisy → ignored)', () => {
    // A single capitalized word after "owner is" should be ignored to avoid
    // false-flagging prose like "owner is Smith" where context is too thin
    // for a meaningful comparison.
    const rationale = 'Owner is Smith. Project is HOT.';
    const out = checkOwnerAnchors(rationale, { owner_name: 'Acme' });
    expect(out.mentioned).toEqual([]);
  });
});
