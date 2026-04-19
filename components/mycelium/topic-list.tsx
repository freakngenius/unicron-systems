"use client";

import { cn } from "@/lib/cn";

export type TopicRow = { topic: string; total: number; count: number };

export function TopicList({
  topics,
  selected,
  onSelect,
}: {
  topics: TopicRow[];
  selected: string | null;
  onSelect: (t: string) => void;
}) {
  return (
    <aside className="w-64 shrink-0 border-r border-line bg-canvas-2">
      <div className="border-b border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-ink-3">
        topics
      </div>
      <ul>
        {topics.map((t) => (
          <li key={t.topic}>
            <button
              onClick={() => onSelect(t.topic)}
              className={cn(
                "flex w-full items-center justify-between border-b border-line/50 px-4 py-3 text-left text-sm hover:bg-canvas-3",
                selected === t.topic && "bg-canvas-3 text-ink",
              )}
            >
              <span>{t.topic}</span>
              <span className="flex items-center gap-2 font-mono text-[10px] text-ink-3">
                <span>{t.count}</span>
                <span className="text-mycelium">
                  {t.total.toFixed(1)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
