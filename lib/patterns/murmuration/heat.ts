// Pure convergence-heat metric. Safe to import from client components.
import type { Output } from "./peers";

export function convergenceHeat(outputs: Output[], cycles: number): number {
  if (outputs.length === 0) return 0;
  const finalCycle = cycles - 1;
  const final = outputs.filter((o) => o.cycle === finalCycle);
  if (final.length < 2) return 0;
  const tokens = final.map((o) =>
    new Set(
      o.content
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 4),
    ),
  );
  let pairs = 0;
  let overlapSum = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const a = tokens[i]!;
      const b = tokens[j]!;
      const inter = new Set([...a].filter((t) => b.has(t)));
      const union = new Set([...a, ...b]);
      if (union.size === 0) continue;
      overlapSum += inter.size / union.size;
      pairs += 1;
    }
  }
  return pairs ? overlapSum / pairs : 0;
}
