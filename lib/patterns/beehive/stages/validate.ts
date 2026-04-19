import { CopyOutput, checkCopy, ValidatorOutput } from "../schemas";

/**
 * Validator is deterministic: runs the rules in `checkCopy`. No LLM call.
 * This keeps the pipeline cheap and gives stable bounce semantics.
 */
export function validate(copy: CopyOutput): ValidatorOutput {
  return checkCopy(copy);
}
