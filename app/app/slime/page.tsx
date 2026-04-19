"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type Candidate = {
  id: string;
  hypothesis: string;
  context: { tam_usd?: string; competition_notes?: string; traction_notes?: string; why_it_wins?: string };
  current_score: number | null;
  alive: boolean;
  eliminated_at_cycle: number | null;
  resource_share: number;
};
type ScoreEvent = {
  id: string;
  candidate_id: string;
  cycle: number;
  score: number;
  reasoning: string;
  criteria_breakdown: Record<string, number>;
};
type Run = {
  id: string;
  current_cycle: number;
  cycles_planned: number;
  status: string;
  criteria: Record<string, number>;
};

export default function SlimePage() {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const r = await fetch(`/api/slime/runs/${id}`);
    if (!r.ok) return;
    const j = await r.json();
    setRun(j.run);
    setCandidates(j.candidates ?? []);
    setEvents(j.events ?? []);
  }, []);

  const seed = async () => {
    setPending(true);
    setSelectedId(null);
    const r = await fetch("/api/slime/seed", { method: "POST" });
    if (!r.ok) { setPending(false); return; }
    const { run_id } = await r.json();
    setRunId(run_id);
    await load(run_id);
    setPending(false);
  };

  const cycle = async () => {
    if (!runId) return;
    setPending(true);
    await fetch(`/api/slime/cycle/${runId}`, { method: "POST" });
    await load(runId);
    setPending(false);
  };

  const runAll = async () => {
    if (!runId) return;
    setPending(true);
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`/api/slime/cycle/${runId}`, { method: "POST" });
      if (!r.ok) break;
      const j = await r.json();
      await load(runId);
      if (j.status !== "running") break;
    }
    setPending(false);
  };

  useEffect(() => {
    if (runId) load(runId);
  }, [runId, load]);

  const currentCycle = run?.current_cycle ?? 0;
  const cyclesPlanned = run?.cycles_planned ?? 3;
  const totalCols = cyclesPlanned + 1; // +1 for the seed column

  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const selectedEvents = events.filter((e) => e.candidate_id === selectedId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Slime Mold · prune-and-converge selector</h1>
        <p className="text-sm text-ink-2">
          10 vertical hypotheses. Each cycle, Sonnet scores all alive candidates. Bottom 50% pruned, survivors double resources.
        </p>
      </header>

      <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2 p-4">
        <Button onClick={seed} disabled={pending}>
          Seed selection
        </Button>
        <Button onClick={cycle} disabled={pending || !runId || run?.status !== "running"} variant="outline">
          Run 1 cycle
        </Button>
        <Button onClick={runAll} disabled={pending || !runId || run?.status !== "running"} variant="outline">
          Run all
        </Button>
        <span className="ml-auto font-mono text-xs text-ink-3">
          cycle {currentCycle}/{cyclesPlanned} · {run?.status ?? "idle"}
        </span>
      </div>

      {candidates.length > 0 && (
        <div className="rounded-lg border border-line bg-canvas-2 p-5">
          <div className="mb-3 font-mono text-[10px] uppercase text-ink-3">
            selection tree (click a row for reasoning)
          </div>
          <div
            className="grid gap-2 text-xs"
            style={{ gridTemplateColumns: `minmax(16rem,1fr) repeat(${totalCols}, minmax(3rem, 1fr)) 5rem` }}
          >
            <div className="text-ink-3">hypothesis</div>
            <div className="text-center text-ink-3">seed</div>
            {Array.from({ length: cyclesPlanned }).map((_, i) => (
              <div key={i} className="text-center text-ink-3">c{i + 1}</div>
            ))}
            <div className="text-right text-ink-3">final</div>

            {candidates.map((c) => {
              const scoresByCycle = new Map<number, number>();
              for (const e of events) {
                if (e.candidate_id === c.id) scoresByCycle.set(e.cycle, Number(e.score));
              }
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  className={cn(
                    "contents cursor-pointer",
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-start gap-2 rounded py-1 pl-2 pr-3 text-left",
                    !c.alive && "opacity-40 line-through",
                    c.id === selectedId && "bg-canvas-3",
                  )}>
                    <span className={cn("h-2 w-2 rounded-full", c.alive ? "bg-slime" : "bg-ink-3")} />
                    <span className="truncate text-ink">{c.hypothesis}</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <div
                      className={cn("h-6 rounded-full bg-slime/20 border border-slime/40")}
                      style={{
                        width: `${12 + Math.min(36, Math.log2(1 + c.resource_share) * 10)}px`,
                      }}
                    />
                  </div>
                  {Array.from({ length: cyclesPlanned }).map((_, i) => {
                    const cy = i + 1;
                    const sc = scoresByCycle.get(cy);
                    const survived = c.alive || (c.eliminated_at_cycle ?? 99) > cy;
                    return (
                      <div key={cy} className="flex items-center justify-center">
                        {sc !== undefined ? (
                          <div
                            className={cn(
                              "rounded font-mono text-[11px] px-2 py-0.5",
                              survived ? "bg-slime/20 text-slime" : "bg-canvas-3 text-ink-3",
                            )}
                          >
                            {sc.toFixed(0)}
                          </div>
                        ) : cy <= currentCycle ? (
                          <span className="text-ink-3">–</span>
                        ) : (
                          <span className="text-ink-3 opacity-30">·</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="text-right font-mono text-sm text-ink">
                    {c.current_score !== null ? c.current_score.toFixed(0) : "–"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-line bg-canvas-2 p-5">
          <h3 className="mb-2 font-display text-lg text-ink">{selected.hypothesis}</h3>
          <p className="mb-4 text-xs text-ink-3">
            TAM: {selected.context.tam_usd ?? "?"} · resource_share ×{Number(selected.resource_share).toFixed(1)}
          </p>
          {selectedEvents.map((e) => (
            <div key={e.id} className="mb-3 rounded border border-line bg-canvas-3 p-3">
              <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase text-ink-3">
                <span>cycle {e.cycle}</span>
                <span className="text-slime">score {Number(e.score).toFixed(0)}</span>
              </div>
              <div className="mb-2 grid grid-cols-5 gap-2 text-[11px]">
                {Object.entries(e.criteria_breakdown).map(([k, v]) => (
                  <div key={k} className="rounded bg-canvas-2 px-2 py-1 text-center">
                    <div className="text-ink-3">{k}</div>
                    <div className="font-mono text-ink">{Number(v).toFixed(0)}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-2">{e.reasoning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
