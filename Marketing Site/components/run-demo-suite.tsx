"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Status = "idle" | "running" | "done" | "error";

export function RunDemoSuiteButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<string[]>([]);

  const run = async () => {
    setStatus("running");
    setLog([]);
    const res = await fetch("/api/demo/run-all", { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      setStatus("error");
      return;
    }
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as { step: string; ok: boolean; note?: string };
          setLog((l) => [...l, `${ev.ok ? "✓" : "✗"} ${ev.step}${ev.note ? ` — ${ev.note}` : ""}`]);
        } catch {
          setLog((l) => [...l, line]);
        }
      }
    }
    setStatus("done");
    router.refresh();
  };

  return (
    <div className="text-right">
      <Button onClick={run} disabled={status === "running"}>
        {status === "running" ? "running demo suite…" : "Run Demo Suite"}
      </Button>
      {log.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-right font-mono text-[10px] text-ink-3">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
