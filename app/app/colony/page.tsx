"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type Market = { key: string; display_name: string; available: number };
type Worker = {
  id: string;
  status: "pending" | "running" | "done" | "errored";
  output_json: {
    pain_quote: string;
    tool_named: string | null;
    price_named: string | null;
    urgency_1_5: number;
  } | null;
  target_ref: string;
};
type Cluster = { id: string; theme: string; size: number; examples: string[] };
type Job = { id: string; market_query: string; target_count: number; completed_count: number; status: string };

const GRID_ROWS = 5;
const GRID_COLS = 10;

export default function ColonyPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [market, setMarket] = useState<string>("mold-remediation");
  const [job, setJob] = useState<Job | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [pending, setPending] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/colony/markets").then(async (r) => {
      if (r.ok) setMarkets((await r.json()).markets ?? []);
    });
  }, []);

  const poll = useCallback(async (jobId: string) => {
    const r = await fetch(`/api/colony/jobs/${jobId}`);
    if (!r.ok) return;
    const j = await r.json();
    setJob(j.job);
    setWorkers(j.workers ?? []);
    setClusters(j.clusters ?? []);
    if (j.job?.status !== "running") {
      setPending(false);
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    }
  }, []);

  const dispatch = async () => {
    setPending(true);
    setJob(null);
    setWorkers([]);
    setClusters([]);
    setSelectedCluster(null);
    const res = await fetch("/api/colony/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market_query: market, target_count: 50 }),
    });
    if (!res.ok) {
      setPending(false);
      alert("Dispatch failed");
      return;
    }
    const { job_id } = await res.json();
    // Kick execute in parallel
    fetch("/api/colony/dispatch/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id }),
    }).catch(() => void 0);
    // Poll immediately then every ~500ms
    poll(job_id);
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => poll(job_id), 500);
  };

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  const doneWorkers = workers.filter((w) => w.status === "done" || w.status === "errored");
  const total = job?.target_count ?? GRID_ROWS * GRID_COLS;
  const completed = job?.completed_count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Ant Colony · parallel discovery swarm</h1>
        <p className="text-sm text-ink-2">
          50 Haiku workers in parallel (concurrency 10). Each extracts a pain signal; Sonnet clusters at the end.
        </p>
      </header>

      <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2 p-4">
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          disabled={pending}
          className="h-10 rounded border border-line bg-canvas-3 px-3 font-mono text-xs text-ink"
        >
          {markets.map((m) => (
            <option key={m.key} value={m.key}>
              {m.display_name} ({m.available} blobs)
            </option>
          ))}
        </select>
        <Button onClick={dispatch} disabled={pending}>
          {pending ? "dispatching…" : "Dispatch swarm"}
        </Button>
        <span className="ml-auto font-mono text-xs text-ink-3">
          {completed}/{total} · {job?.status ?? "idle"}
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-6">
        <div className="rounded-lg border border-line bg-canvas-2 p-5">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, 1.25rem)`,
              gridTemplateRows: `repeat(${GRID_ROWS}, 1.25rem)`,
            }}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, i) => {
              const w = workers[i];
              const state = w?.status ?? "idle";
              return (
                <span
                  key={i}
                  className={cn(
                    "h-5 w-5 rounded-full transition",
                    state === "done" && "bg-colony",
                    state === "running" && "bg-beehive animate-pulse",
                    state === "errored" && "bg-slime",
                    (state === "pending" || state === "idle") && "bg-canvas-3 border border-line",
                  )}
                  title={w?.target_ref?.slice(0, 60)}
                />
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-canvas-2 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase text-ink-3">
            live extractions
          </div>
          <div className="h-64 overflow-auto space-y-1 text-xs font-mono">
            {doneWorkers
              .slice(-20)
              .reverse()
              .map((w) =>
                w.output_json ? (
                  <div key={w.id} className="border-l-2 border-colony/40 pl-2 text-ink-2">
                    <span className="text-colony">[{w.output_json.urgency_1_5}]</span> {w.output_json.pain_quote}
                    {w.output_json.tool_named && <span className="ml-2 text-ink-3">· {w.output_json.tool_named}</span>}
                  </div>
                ) : null,
              )}
            {doneWorkers.length === 0 && (
              <p className="text-ink-3">pain quotes will stream here as workers complete.</p>
            )}
          </div>
        </div>
      </div>

      {clusters.length > 0 && (
        <div className="rounded-lg border border-line bg-canvas-2 p-5">
          <div className="mb-3 font-mono text-[10px] uppercase text-ink-3">clusters</div>
          <div className="flex flex-wrap gap-2">
            {clusters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCluster(selectedCluster?.id === c.id ? null : c)}
                className={cn(
                  "rounded-full border border-colony/50 bg-colony/10 px-3 py-1 text-sm text-ink transition hover:bg-colony/20",
                  selectedCluster?.id === c.id && "bg-colony/30",
                )}
                style={{ fontSize: `${0.8 + Math.min(0.6, c.size / 20)}rem` }}
              >
                {c.theme} <span className="text-ink-3">· {c.size}</span>
              </button>
            ))}
          </div>
          {selectedCluster && (
            <div className="mt-4 space-y-2">
              {selectedCluster.examples.map((ex, i) => (
                <blockquote key={i} className="border-l-2 border-colony pl-3 text-sm text-ink-2">
                  {ex}
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
