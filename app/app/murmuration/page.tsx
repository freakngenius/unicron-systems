"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { convergenceHeat } from "@/lib/patterns/murmuration/heat";

type Output = {
  id: string;
  agent_idx: number;
  cycle: number;
  content: string;
  peer_refs: string[];
  created_at: string;
};

type Run = {
  id: string;
  prompt: string;
  peer_n: number;
  cycles: number;
  agent_count: number;
  status: string;
};

const DEFAULT_PROMPT =
  "Write a landing-page headline for AcmeMold — an AI that stops mold from ruining your home. Tight, bold, and distinct.";

export default function MurmurationPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [pending, setPending] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);
  const poll = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async (id: string) => {
    const r = await fetch(`/api/murmuration/runs/${id}`);
    if (!r.ok) return;
    const j = await r.json();
    setRun(j.run);
    setOutputs(j.outputs ?? []);
    if (j.run?.status !== "running") {
      setPending(false);
      if (poll.current) { clearInterval(poll.current); poll.current = null; }
    }
  }, []);

  const start = async () => {
    setPending(true);
    setRun(null);
    setOutputs([]);
    setHoveredId(null);
    const res = await fetch("/api/murmuration/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, peer_n: 3, cycles: 5, agent_count: 7 }),
    });
    if (!res.ok) { setPending(false); alert("run failed"); return; }
    const { run_id } = await res.json();
    setRunId(run_id);
    // Phase 2 in parallel
    fetch("/api/murmuration/run/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id }),
    }).catch(() => void 0);
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(() => load(run_id), 800);
    load(run_id);
  };

  useEffect(() => () => {
    if (poll.current) clearInterval(poll.current);
  }, []);

  const exportTop3 = async () => {
    const cycles = run?.cycles ?? 5;
    const finals = outputs
      .filter((o) => o.cycle === cycles - 1)
      .slice(0, 3)
      .map((o) => o.content)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(finals);
      setCopiedNote("copied top 3");
      setTimeout(() => setCopiedNote(null), 2000);
    } catch {
      setCopiedNote("copy failed");
    }
  };

  const agentCount = run?.agent_count ?? 7;
  const cycles = run?.cycles ?? 5;
  const heat = run?.status === "succeeded" ? convergenceHeat(outputs, cycles) : 0;

  const cell = (agentIdx: number, cycle: number) => {
    return outputs.find((o) => o.agent_idx === agentIdx && o.cycle === cycle) ?? null;
  };
  const peerRefIds = new Set(
    hoveredId ? (outputs.find((o) => o.id === hoveredId)?.peer_refs ?? []) : [],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Murmuration · local-peer variant engine</h1>
        <p className="text-sm text-ink-2">
          7 agents × 5 cycles = 35 variants. Each sees 3 most-recent peer outputs. No central editor.
        </p>
      </header>

      <div className="space-y-2 rounded-lg border border-line bg-canvas-2 p-4">
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="flex items-center gap-3">
          <Button onClick={start} disabled={pending}>
            {pending ? "flocking…" : "Run flock"}
          </Button>
          <span className="font-mono text-xs text-ink-3">{run?.status ?? "idle"}</span>
          {run?.status === "succeeded" && (
            <>
              <span className="ml-auto font-mono text-xs text-murmuration">
                convergence heat {heat.toFixed(2)}
              </span>
              <Button size="sm" variant="outline" onClick={exportTop3}>
                Export top 3
              </Button>
              {copiedNote && <span className="font-mono text-[10px] text-ink-3">{copiedNote}</span>}
            </>
          )}
        </div>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `3.5rem repeat(${agentCount}, minmax(8rem, 1fr))` }}
      >
        <div />
        {Array.from({ length: agentCount }).map((_, i) => (
          <div key={i} className="text-center font-mono text-[10px] uppercase text-ink-3">
            agent {i}
          </div>
        ))}

        {Array.from({ length: cycles }).map((_, cycle) => (
          <Fragment key={`cycle-${cycle}`}>
            <div className="flex items-center justify-end pr-1 font-mono text-[10px] text-ink-3">
              c{cycle}
            </div>
            {Array.from({ length: agentCount }).map((_, agent_idx) => {
              const c = cell(agent_idx, cycle);
              const shade = 0.3 + 0.6 * (cycle / Math.max(1, cycles - 1));
              const isPeerRef = c && peerRefIds.has(c.id);
              const isHovered = c?.id === hoveredId;
              return (
                <div
                  key={`${cycle}-${agent_idx}`}
                  className={cn(
                    "rounded border p-2 text-xs text-ink transition",
                    c ? "border-murmuration/40" : "border-line bg-canvas-3",
                    isPeerRef && "ring-2 ring-murmuration",
                    isHovered && "ring-2 ring-ink",
                  )}
                  style={
                    c
                      ? {
                          backgroundColor: `color-mix(in oklab, var(--accent-4) ${Math.round(shade * 14)}%, var(--bg-2))`,
                        }
                      : {}
                  }
                  onMouseEnter={() => c && setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {c ? c.content : <span className="text-ink-3 opacity-40">·</span>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
