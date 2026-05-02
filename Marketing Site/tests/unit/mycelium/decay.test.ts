import { describe, it, expect } from "vitest";
import { decayStrength, ARCHIVE_THRESHOLD } from "@/lib/patterns/mycelium/decay";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("decayStrength", () => {
  const now = new Date("2026-04-19T12:00:00Z");

  it("leaves strength unchanged when touched seconds ago", () => {
    const r = decayStrength({ strength: 5, last_touched: new Date(now.getTime() - 10_000).toISOString(), ttl_days: 14, now });
    expect(r.strength).toBeCloseTo(5, 3);
    expect(r.archived).toBe(false);
  });

  it("decays proportionally over time (~half at 1 ttl period of continuous staleness)", () => {
    const r = decayStrength({ strength: 4, last_touched: new Date(now.getTime() - 14 * DAY).toISOString(), ttl_days: 14, now });
    expect(r.strength).toBeGreaterThan(1.2);
    expect(r.strength).toBeLessThan(2.8);
  });

  it("monotonically decays: longer stale => lower strength", () => {
    const a = decayStrength({ strength: 5, last_touched: new Date(now.getTime() - 3 * DAY).toISOString(), ttl_days: 14, now });
    const b = decayStrength({ strength: 5, last_touched: new Date(now.getTime() - 10 * DAY).toISOString(), ttl_days: 14, now });
    expect(b.strength).toBeLessThan(a.strength);
  });

  it("archives when strength falls below threshold", () => {
    const r = decayStrength({ strength: 0.2, last_touched: new Date(now.getTime() - 60 * DAY).toISOString(), ttl_days: 14, now });
    expect(r.archived).toBe(true);
    expect(r.strength).toBeLessThan(ARCHIVE_THRESHOLD);
  });

  it("never returns negative strength", () => {
    const r = decayStrength({ strength: 0.01, last_touched: new Date(now.getTime() - 365 * DAY).toISOString(), ttl_days: 14, now });
    expect(r.strength).toBeGreaterThanOrEqual(0);
  });

  it("respects ttl_days — longer TTL decays slower", () => {
    const short = decayStrength({ strength: 5, last_touched: new Date(now.getTime() - 7 * DAY).toISOString(), ttl_days: 7, now });
    const long = decayStrength({ strength: 5, last_touched: new Date(now.getTime() - 7 * DAY).toISOString(), ttl_days: 28, now });
    expect(long.strength).toBeGreaterThan(short.strength);
  });
});
