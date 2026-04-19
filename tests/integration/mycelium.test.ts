import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseService } from "@/lib/supabase";
import { decayStrength } from "@/lib/patterns/mycelium/decay";

const TEST_TOPIC = "integration-test-topic-" + Math.random().toString(36).slice(2, 8);

describe("mycelium integration", () => {
  let insertedIds: string[] = [];

  afterAll(async () => {
    const db = supabaseService();
    if (insertedIds.length) await db.from("signals").delete().in("id", insertedIds);
  });

  it("round-trips an insert and decay", async () => {
    const db = supabaseService();
    const { data, error } = await db
      .from("signals")
      .insert({
        topic: TEST_TOPIC,
        type: "FACT",
        source_agent: "test",
        body: "integration test signal — should not survive",
        strength: 2.0,
        ttl_days: 1,
        last_touched: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    insertedIds.push(data!.id);

    // Apply decay manually; strength should plummet because age=10d >> ttl=1d.
    const r = decayStrength({
      strength: Number(data!.strength),
      last_touched: data!.last_touched,
      ttl_days: data!.ttl_days,
    });
    expect(r.strength).toBeLessThan(0.01);
    expect(r.archived).toBe(true);
  });

  it("can select by topic and strength", async () => {
    const db = supabaseService();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data } = await db
        .from("signals")
        .insert({
          topic: TEST_TOPIC,
          type: "FACT",
          source_agent: "test",
          body: `strength test ${i}`,
          strength: i + 1,
        })
        .select("*")
        .single();
      if (data) { ids.push(data.id); insertedIds.push(data.id); }
    }
    const { data: rows } = await db
      .from("signals")
      .select("*")
      .eq("topic", TEST_TOPIC)
      .eq("archived", false)
      .order("strength", { ascending: false })
      .limit(5);
    expect((rows ?? []).length).toBeGreaterThanOrEqual(3);
    const strengths = (rows ?? []).map((r) => Number(r.strength));
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i - 1]!).toBeGreaterThanOrEqual(strengths[i]!);
    }
  });
});
