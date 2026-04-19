import { describe, it, expect } from "vitest";
import { findReinforcement } from "@/lib/patterns/mycelium/similarity";

describe("findReinforcement", () => {
  it("short-circuits when no candidates", async () => {
    const r = await findReinforcement("anything", []);
    expect(r.match_id).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
