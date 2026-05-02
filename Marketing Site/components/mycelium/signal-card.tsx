"use client";

import { cn } from "@/lib/cn";
import type { Signal } from "@/lib/patterns/mycelium/types";

const TYPE_COLORS: Record<string, string> = {
  FACT: "bg-colony/20 text-colony",
  QUESTION: "bg-mycelium/20 text-mycelium",
  PATTERN: "bg-murmuration/20 text-murmuration",
  RISK: "bg-slime/20 text-slime",
};

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return "today";
  if (d === 1) return "1d";
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

export function SignalCard({
  signal,
  onReinforce,
}: {
  signal: Signal;
  onReinforce?: (id: string) => void;
}) {
  const opacity = 0.4 + 0.6 * Math.min(1, Number(signal.strength) / 10);
  const strengthPct = Math.min(1, Number(signal.strength) / 10) * 100;
  return (
    <div
      className="rounded-lg border border-line bg-canvas-2 p-4 transition hover:border-ink-3"
      style={{ opacity }}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("rounded px-2 py-0.5 font-mono", TYPE_COLORS[signal.type] ?? "bg-canvas-3 text-ink-3")}>
          {signal.type}
        </span>
        <span className="font-mono text-ink-3">{signal.source_agent}</span>
        <span className="ml-auto font-mono text-ink-3">{ageLabel(signal.last_touched)}</span>
      </div>
      <p className="mt-3 font-display text-sm leading-relaxed text-ink">{signal.body}</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1 flex-1 rounded-full bg-canvas-3">
          <div className="h-full rounded-full bg-mycelium" style={{ width: `${strengthPct}%` }} />
        </div>
        <span className="font-mono text-[10px] text-ink-3">{Number(signal.strength).toFixed(1)}</span>
        {onReinforce && (
          <button
            type="button"
            onClick={() => onReinforce(signal.id)}
            className="rounded border border-line px-2 py-0.5 font-mono text-[10px] text-ink-2 hover:border-mycelium hover:text-mycelium"
          >
            +1
          </button>
        )}
      </div>
    </div>
  );
}
