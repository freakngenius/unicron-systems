export const ARCHIVE_THRESHOLD = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DecayInput {
  strength: number;
  last_touched: string | Date;
  ttl_days: number;
  now?: Date;
}

export interface DecayResult {
  strength: number;
  archived: boolean;
}

/**
 * Exponential decay toward zero with a half-life of one TTL period.
 *   strength(t) = strength0 * 0.5^(age_days / ttl_days)
 * A signal loses ~50% of its strength after `ttl_days` of no reinforcement,
 * and continues halving every ttl_days beyond that.
 */
export function decayStrength(input: DecayInput): DecayResult {
  const now = input.now ?? new Date();
  const touched = new Date(input.last_touched);
  const ageMs = Math.max(0, now.getTime() - touched.getTime());
  const ageDays = ageMs / DAY_MS;
  const ttl = Math.max(1, input.ttl_days);
  const decayed = input.strength * Math.pow(0.5, ageDays / ttl);
  const clamped = Math.max(0, decayed);
  return { strength: clamped, archived: clamped < ARCHIVE_THRESHOLD };
}
