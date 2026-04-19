"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const AGENTS = ["CEO", "Research", "CMO", "Kyle", "Keenan"] as const;

export function DropForm({ onDropped }: { onDropped: () => void }) {
  const [body, setBody] = useState("");
  const [agent, setAgent] = useState<(typeof AGENTS)[number]>("Kyle");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit() {
    if (!body.trim()) return;
    setPending(true);
    setNote(null);
    const res = await fetch("/api/mycelium/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, source_agent: agent }),
    });
    const json = await res.json();
    setPending(false);
    if (!res.ok) {
      setNote(json?.error ?? "error");
      return;
    }
    setNote(json.reinforced ? "reinforced existing signal" : "new signal dropped");
    setBody("");
    onDropped();
  }

  return (
    <div className="rounded-lg border border-line bg-canvas-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Drop a signal</h2>
        <div className="flex items-center gap-2">
          <label className="font-mono text-[10px] text-ink-3">source</label>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value as (typeof AGENTS)[number])}
            className="rounded border border-line bg-canvas-3 px-2 py-1 font-mono text-xs text-ink"
          >
            {AGENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Three PAs today said they lose $8k/claim from missed deadlines..."
        className="mt-3"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "classifying…" : "Drop"}
        </Button>
        {note && <span className="font-mono text-xs text-ink-3">{note}</span>}
      </div>
    </div>
  );
}
