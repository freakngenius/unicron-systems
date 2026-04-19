"use client";

import { cn } from "@/lib/cn";

export type StageState = "pending" | "running" | "pass" | "fail" | "bounced";

const STATE_RING: Record<StageState, string> = {
  pending: "border-line text-ink-3",
  running: "border-beehive text-beehive animate-pulse",
  pass: "border-colony text-colony",
  fail: "border-slime text-slime",
  bounced: "border-beehive/70 text-beehive",
};

const STATE_LABEL: Record<StageState, string> = {
  pending: "waiting",
  running: "running",
  pass: "pass",
  fail: "fail",
  bounced: "bounced",
};

export function StageNode({
  label,
  state,
  retryCount,
  onClick,
  selected,
}: {
  label: string;
  state: StageState;
  retryCount?: number;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-40 flex-col items-start gap-1 rounded-lg border-2 bg-canvas-2 px-3 py-2 text-left transition",
        STATE_RING[state],
        selected && "ring-2 ring-ink-2",
      )}
    >
      <span className="font-display text-sm text-ink">{label}</span>
      <span className="flex items-center gap-2 font-mono text-[10px]">
        <span>{STATE_LABEL[state]}</span>
        {typeof retryCount === "number" && retryCount > 0 && (
          <span className="text-ink-3">retry ×{retryCount}</span>
        )}
      </span>
    </button>
  );
}
