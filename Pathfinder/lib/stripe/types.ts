// Wave 4 — Gate 13Z-A. Shared Stripe billing types.
//
// Imported by lib/stripe/client.ts, future webhook handler (13Z-C),
// quota enforcement (13Z-D), and the billing UI (13Z-B). Decoupled from
// the `stripe` npm package so this file imports cleanly even before the
// SDK is installed (the SDK lands with 13Z-B).

export type Tier = 'starter' | 'pro' | 'enterprise';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export type UsageEventType =
  | 'lead_enriched'
  | 'contact_enriched'
  | 'outreach_sent'
  | 'tower_estimated'
  | 'rank_run';

export interface TierLimits {
  enrichedLeadsPerMonth: number | 'unlimited';
  outreachesPerMonth: number | 'unlimited';
  connectedUsers: number | 'unlimited';
  customerOrgBranches: number | 'unlimited';
  hubspotBidirectional: boolean;
  dailyIntelligenceBrief: boolean;
}

// Locked for Wave 4. Source of truth for quota enforcement (13Z-D) and
// for the billing UI's Upgrade CTA (13Z-B). Update here, not in callers.
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  starter: {
    enrichedLeadsPerMonth: 100,
    outreachesPerMonth: 200,
    connectedUsers: 1,
    customerOrgBranches: 1,
    hubspotBidirectional: false,
    dailyIntelligenceBrief: false,
  },
  pro: {
    enrichedLeadsPerMonth: 1000,
    outreachesPerMonth: 2000,
    connectedUsers: 10,
    customerOrgBranches: 'unlimited',
    hubspotBidirectional: true,
    dailyIntelligenceBrief: true,
  },
  enterprise: {
    enrichedLeadsPerMonth: 'unlimited',
    outreachesPerMonth: 'unlimited',
    connectedUsers: 'unlimited',
    customerOrgBranches: 'unlimited',
    hubspotBidirectional: true,
    dailyIntelligenceBrief: true,
  },
};

export const TIER_PRICING_USD: Record<Tier, number | null> = {
  starter: 99,
  pro: 499,
  enterprise: null, // contact sales
};

export interface SubscriptionRow {
  id: string;
  customer_org_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  tier: Tier;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}
