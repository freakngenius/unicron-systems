/**
 * Minimal promise-concurrency semaphore. `run(fn)` resolves with fn's result
 * once a slot is free. Up to `max` fns execute at once.
 */
export function semaphore(max: number) {
  if (max < 1) throw new Error("max must be >= 1");
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    const head = queue.shift();
    if (head) head();
  };
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= max) {
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      active += 1;
      try {
        return await fn();
      } finally {
        active -= 1;
        next();
      }
    },
    size() { return active; },
  };
}

/** High-level runAll: maps tasks through the semaphore and resolves with all results. */
export async function runWithConcurrency<T, R>(
  items: T[],
  max: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const sem = semaphore(max);
  return Promise.all(items.map((item, idx) => sem.run(() => fn(item, idx))));
}
