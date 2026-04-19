import { describe, it, expect } from "vitest";
import { selectPeers, type Output } from "@/lib/patterns/murmuration/peers";

function mk(agent_idx: number, cycle: number, tag = ""): Output {
  return {
    id: `${agent_idx}-${cycle}-${tag}`,
    agent_idx,
    cycle,
    content: `a${agent_idx}-c${cycle}${tag}`,
    created_at: `2026-04-19T00:${cycle.toString().padStart(2, "0")}:${agent_idx.toString().padStart(2, "0")}Z`,
  };
}

describe("selectPeers", () => {
  it("excludes self", () => {
    const outs = [mk(0, 0), mk(1, 0), mk(2, 0)];
    const peers = selectPeers(outs, 1, 3);
    expect(peers.every((p) => p.agent_idx !== 1)).toBe(true);
  });

  it("returns the n most recent by cycle", () => {
    const outs = [
      mk(0, 0), mk(1, 0), mk(2, 0),
      mk(0, 1), mk(1, 1), mk(2, 1),
      mk(0, 2),
    ];
    const peers = selectPeers(outs, 0, 3);
    // Most recent: (2,1), (1,1), then any from cycle 0. Never agent 0.
    expect(peers.map((p) => `${p.agent_idx}:${p.cycle}`)).toEqual([
      "2:1",
      "1:1",
      "2:0",
    ]);
  });

  it("returns fewer than n when not enough peers", () => {
    const outs = [mk(0, 0), mk(1, 0)];
    const peers = selectPeers(outs, 0, 5);
    expect(peers).toHaveLength(1);
    expect(peers[0]!.agent_idx).toBe(1);
  });

  it("returns empty when only self has outputs", () => {
    const outs = [mk(0, 0), mk(0, 1)];
    expect(selectPeers(outs, 0, 3)).toEqual([]);
  });

  it("returns empty on empty input", () => {
    expect(selectPeers([], 0, 3)).toEqual([]);
  });
});
