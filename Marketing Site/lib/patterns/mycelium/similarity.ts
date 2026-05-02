import { callJSON, DEFAULT_HAIKU } from "@/lib/anthropic";
import { SimilarityOut, type Signal } from "./types";

export const SIMILARITY_THRESHOLD = 0.8;

type Candidate = Pick<Signal, "id" | "body">;

export async function findReinforcement(newBody: string, candidates: Candidate[]) {
  if (candidates.length === 0) {
    return { match_id: null, confidence: 0, reason: "no candidates" } as const;
  }
  const numbered = candidates
    .map((c, i) => `[${i}] id=${c.id}\n${c.body}`)
    .join("\n\n");

  return callJSON(
    {
      model: DEFAULT_HAIKU,
      max_tokens: 240,
      temperature: 0,
      system:
        "You decide if a NEW team-memory signal is semantically duplicative of any EXISTING signal. " +
        "Duplicative means the new signal would reinforce or slightly refine an existing one, " +
        "not introduce new information. Return {match_id, confidence, reason}. " +
        "match_id must be an exact UUID from the EXISTING list, or null if none. " +
        "confidence ∈ [0,1]. Only return a non-null match_id when confidence >= 0.8.",
      user: `NEW:\n${newBody}\n\nEXISTING:\n${numbered}\n\nDecide.`,
    },
    SimilarityOut,
  );
}
