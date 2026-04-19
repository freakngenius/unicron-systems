export interface Output {
  id: string;
  agent_idx: number;
  cycle: number;
  content: string;
  created_at: string;
}

/**
 * For agent `selfIdx` in cycle `K`, return the `n` most-recent outputs
 * produced by OTHER agents across all previous cycles (and the current
 * cycle if they already finished). Most recent by (cycle, agent_idx)
 * lexicographic order.
 */
export function selectPeers(outputs: Output[], selfIdx: number, n: number): Output[] {
  const others = outputs.filter((o) => o.agent_idx !== selfIdx);
  const sorted = [...others].sort((a, b) => {
    if (b.cycle !== a.cycle) return b.cycle - a.cycle;
    if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
    return b.agent_idx - a.agent_idx;
  });
  return sorted.slice(0, n);
}
