import { describe, it, expect } from "vitest";
import { runWithConcurrency, semaphore } from "@/lib/patterns/colony/semaphore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("semaphore", () => {
  it("runs tasks up to max concurrency", async () => {
    const sem = semaphore(3);
    let inflight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, (_, i) =>
      sem.run(async () => {
        inflight += 1;
        peak = Math.max(peak, inflight);
        await sleep(10);
        inflight -= 1;
        return i;
      }),
    );
    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("runWithConcurrency preserves order in results", async () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const r = await runWithConcurrency(xs, 2, async (x) => {
      await sleep(5 - x); // reverse-correlated delay
      return x * 10;
    });
    expect(r).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("max=1 runs fully serially", async () => {
    const sem = semaphore(1);
    let inflight = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        sem.run(async () => {
          inflight += 1;
          peak = Math.max(peak, inflight);
          await sleep(5);
          inflight -= 1;
        }),
      ),
    );
    expect(peak).toBe(1);
  });
});
