import { CopyOutput, StrategyOutput, ValidatorOutput } from "./schemas";

export const MAX_COPY_RETRIES = 2;

export type BounceResult = {
  copy: CopyOutput;
  validator: ValidatorOutput;
  retries: number;
  trajectory: Array<{ copy: CopyOutput; validator: ValidatorOutput }>;
};

/**
 * Pure bounce loop: call copyFn, validate, retry with issues up to MAX_COPY_RETRIES.
 * No DB writes. Unit-testable.
 */
export async function bounceLoop(
  s: StrategyOutput,
  copyFn: (s: StrategyOutput, issues?: string[]) => Promise<CopyOutput>,
  validateFn: (c: CopyOutput) => ValidatorOutput,
  maxRetries = MAX_COPY_RETRIES,
): Promise<BounceResult> {
  const trajectory: BounceResult["trajectory"] = [];
  let c = await copyFn(s);
  let v = validateFn(c);
  trajectory.push({ copy: c, validator: v });
  let retries = 0;
  while (!v.pass && retries < maxRetries) {
    retries += 1;
    c = await copyFn(s, v.issues);
    v = validateFn(c);
    trajectory.push({ copy: c, validator: v });
  }
  return { copy: c, validator: v, retries, trajectory };
}
