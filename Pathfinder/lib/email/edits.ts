// lib/email/edits.ts — Stream B Gate B2.
//
// Pure helpers for capturing the diff between (model draft) and
// (rep-sent text). The Pulse agent (post-Phase-2) trains on this signal.
//
// editDistance is a cheap O(n*m) Levenshtein. n+m caps at ~2000 chars
// (email body) so the cost is negligible. If we ever exceed that scale
// we'd swap to a streaming differ; the stored value is a single integer
// either way.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;

  // Two-row DP — O(min(m,n)) memory.
  let prev: number[] = new Array(n + 1);
  let curr: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export interface EditCapture {
  edit_distance: number;
  draft_length: number;
  sent_length: number;
  similarity: number; // 0..1, 1 = identical
  unchanged: boolean;
  // Coarse quartile: 'unchanged' | 'minor' (<10% delta) |
  // 'moderate' (10-30%) | 'heavy' (>30%). Useful for the
  // dashboard rollup without re-deriving from raw distance.
  edit_band: 'unchanged' | 'minor' | 'moderate' | 'heavy';
}

export function captureEdit(args: { draftBody: string; sentBody: string }): EditCapture {
  const distance = levenshtein(args.draftBody, args.sentBody);
  const maxLen = Math.max(args.draftBody.length, args.sentBody.length);
  const similarity = maxLen === 0 ? 1 : 1 - distance / maxLen;
  const delta = maxLen === 0 ? 0 : distance / maxLen;
  const unchanged = distance === 0;
  const band: EditCapture['edit_band'] = unchanged
    ? 'unchanged'
    : delta < 0.1
      ? 'minor'
      : delta <= 0.3
        ? 'moderate'
        : 'heavy';
  return {
    edit_distance: distance,
    draft_length: args.draftBody.length,
    sent_length: args.sentBody.length,
    similarity,
    unchanged,
    edit_band: band,
  };
}
