"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StageNode, type StageState } from "@/components/beehive/stage-node";

type Stage = {
  id: string;
  stage_name: "research" | "strategy" | "copy" | "validate";
  input_json: unknown;
  output_json: unknown;
  validation_status: "pass" | "fail" | "bounced" | null;
  retry_count: number;
  started_at: string;
  completed_at: string | null;
};

type Run = {
  id: string;
  input_url: string;
  status: "running" | "succeeded" | "failed";
  final_output: {
    subject: string;
    line1: string;
    line2: string;
    line3: string;
    cta: string;
  } | null;
};

const SEED_URLS = [
  "publicadjustersflorida.com",
  "acmemold.com",
  "propdata.io",
  "restoragroup.com",
  "midsizesaas.com",
];

const STAGE_ORDER = ["research", "strategy", "copy", "validate"] as const;

function stageState(run: Run | null, stages: Stage[], name: (typeof STAGE_ORDER)[number]): StageState {
  if (!run) return "pending";
  const filtered = stages.filter((s) => s.stage_name === name);
  if (filtered.length === 0) {
    return run.status === "running" ? "pending" : "pending";
  }
  const latest = filtered[filtered.length - 1]!;
  if (name === "validate") {
    if (latest.validation_status === "pass") return "pass";
    if (latest.validation_status === "fail") return "fail";
    if (latest.validation_status === "bounced") return "bounced";
  }
  return run.status === "running" ? "running" : "pass";
}

export default function BeehivePage() {
  const [inputUrl, setInputUrl] = useState(SEED_URLS[0]!);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  const [selectedStage, setSelectedStage] = useState<(typeof STAGE_ORDER)[number] | null>(null);

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/beehive/runs");
    if (r.ok) setHistory((await r.json()).runs ?? []);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Poll current run
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch(`/api/beehive/runs/${runId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (cancelled) return;
      setRun(json.run);
      setStages(json.stages ?? []);
      if (json.run?.status !== "running") {
        setPending(false);
        loadHistory();
      }
    };
    tick();
    const id = setInterval(() => {
      if (!cancelled && run?.status !== "running" && runId === runId) {
        // still poll until first terminal response arrives
      }
      tick();
    }, 800);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId, run?.status, loadHistory]);

  const startRun = async () => {
    setPending(true);
    setRun(null);
    setStages([]);
    setSelectedStage(null);
    const res = await fetch("/api/beehive/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input_url: inputUrl }),
    });
    if (!res.ok) {
      setPending(false);
      alert("Run failed to start");
      return;
    }
    const json = await res.json();
    setRunId(json.run_id);
    // Kick off phase 2 in parallel; don't await.
    fetch("/api/beehive/run/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: json.run_id, input_url: inputUrl }),
    }).catch(() => void 0);
  };

  const latestStageForSelected =
    selectedStage ? stages.filter((s) => s.stage_name === selectedStage).slice(-1)[0] : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Beehive · specialist pipeline</h1>
        <p className="text-sm text-ink-2">
          Research → Strategy → Copy → Validator. Validator bounces copy back on schema fail; max 2 retries.
        </p>
      </header>

      <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2 p-4">
        <select
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          className="h-10 rounded border border-line bg-canvas-3 px-3 font-mono text-xs text-ink"
        >
          {SEED_URLS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <Input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          className="font-mono text-xs"
        />
        <Button onClick={startRun} disabled={pending || !inputUrl}>
          {pending ? "running…" : "Run pipeline"}
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-canvas-2 p-5">
        <div className="flex items-center gap-3">
          {STAGE_ORDER.map((name, i) => {
            const latestRetryCount = stages
              .filter((s) => s.stage_name === name)
              .reduce((m, s) => Math.max(m, s.retry_count), 0);
            const st = stageState(run, stages, name);
            return (
              <div key={name} className="flex items-center gap-3">
                <StageNode
                  label={name}
                  state={st}
                  retryCount={latestRetryCount}
                  selected={selectedStage === name}
                  onClick={() => setSelectedStage((s) => (s === name ? null : name))}
                />
                {i < STAGE_ORDER.length - 1 && (
                  <span className="text-ink-3">→</span>
                )}
              </div>
            );
          })}
        </div>

        {selectedStage && latestStageForSelected && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-line bg-canvas-3 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase text-ink-3">input</div>
              <pre className="max-h-64 overflow-auto text-xs text-ink">
                {JSON.stringify(latestStageForSelected.input_json, null, 2)}
              </pre>
            </div>
            <div className="rounded border border-line bg-canvas-3 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase text-ink-3">output</div>
              <pre className="max-h-64 overflow-auto text-xs text-ink">
                {JSON.stringify(latestStageForSelected.output_json, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {run?.status === "succeeded" && run.final_output && (
        <div className="rounded-lg border border-colony/40 bg-canvas-2 p-5">
          <div className="mb-3 font-mono text-[10px] uppercase text-colony">final email</div>
          <div className="space-y-2 font-display text-sm text-ink">
            <div><span className="font-mono text-[10px] text-ink-3">subject: </span>{run.final_output.subject}</div>
            <div>{run.final_output.line1}</div>
            <div>{run.final_output.line2}</div>
            <div>{run.final_output.line3}</div>
            <div className="pt-2 text-ink-2">{run.final_output.cta}</div>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-display text-lg">Recent runs</h2>
        <div className="divide-y divide-line rounded-lg border border-line bg-canvas-2">
          {history.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2 font-mono text-xs">
              <span className="text-ink">{r.input_url}</span>
              <span
                className={
                  r.status === "succeeded"
                    ? "text-colony"
                    : r.status === "failed"
                      ? "text-slime"
                      : "text-beehive"
                }
              >
                {r.status}
              </span>
            </div>
          ))}
          {history.length === 0 && (
            <div className="px-4 py-3 font-mono text-xs text-ink-3">no runs yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
