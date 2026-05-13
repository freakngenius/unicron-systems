// Wave 4 — Gate 13Z-A. Stripe client wrapper.
//
// 13Z-A constraint: the `stripe` npm package is NOT yet installed and live
// keys are NOT yet provisioned. This file is the seam that 13Z-B will swap
// to import the real SDK. Until then, `getStripeClient()` throws a
// well-named error so any accidental runtime use surfaces loudly rather
// than failing silently with a missing-key generic.
//
// Server-side only. Never import this from a client component or expose
// STRIPE_SECRET_KEY in the browser bundle.

import type { Tier } from './types';

export const STRIPE_ENABLED = Boolean(
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.length > 0
);

export class StripeNotConfiguredError extends Error {
  constructor(missing: string) {
    super(
      `Stripe is not configured: ${missing}. ` +
        `Set STRIPE_SECRET_KEY (and tier price IDs) in the deployment env. ` +
        `See MEMORY/operator-todos/2026-05-03-stripe-setup.md.`
    );
    this.name = 'StripeNotConfiguredError';
  }
}

// 13Z-B will replace this stub with `new Stripe(secretKey, { apiVersion })`
// once `pnpm add stripe` has run and live keys are in env.
export function getStripeClient(): never {
  throw new StripeNotConfiguredError(
    STRIPE_ENABLED
      ? 'stripe SDK not yet installed (Gate 13Z-B)'
      : 'STRIPE_SECRET_KEY missing'
  );
}

export function getPriceIdForTier(tier: Tier): string {
  switch (tier) {
    case 'starter': {
      const id = process.env.STRIPE_PRICE_ID_STARTER;
      if (!id) throw new StripeNotConfiguredError('STRIPE_PRICE_ID_STARTER missing');
      return id;
    }
    case 'pro': {
      const id = process.env.STRIPE_PRICE_ID_PRO;
      if (!id) throw new StripeNotConfiguredError('STRIPE_PRICE_ID_PRO missing');
      return id;
    }
    case 'enterprise':
      throw new Error('enterprise tier is contact-sales only — no Stripe price ID');
  }
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeNotConfiguredError('STRIPE_WEBHOOK_SECRET missing');
  return secret;
}
