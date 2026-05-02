"use client";

import { useCallback, useEffect, useState } from "react";
import { DropForm } from "@/components/mycelium/drop-form";
import { SignalCard } from "@/components/mycelium/signal-card";
import { TopicList, type TopicRow } from "@/components/mycelium/topic-list";
import { Button } from "@/components/ui/button";
import type { Signal } from "@/lib/patterns/mycelium/types";

export default function MyceliumPage() {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [decaying, setDecaying] = useState(false);
  const [devCron, setDevCron] = useState<string>("");

  const loadTopics = useCallback(async () => {
    const res = await fetch("/api/mycelium/topics");
    if (!res.ok) return;
    const j = await res.json();
    setTopics(j.topics ?? []);
    if (!selected && j.topics?.[0]) setSelected(j.topics[0].topic);
  }, [selected]);

  const loadSignals = useCallback(async (topic: string | null) => {
    if (!topic) return;
    const res = await fetch(`/api/mycelium/signals?topic=${encodeURIComponent(topic)}&limit=40`);
    if (!res.ok) return;
    const j = await res.json();
    setSignals(j.signals ?? []);
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    loadSignals(selected);
  }, [selected, loadSignals]);

  const onReinforce = useCallback(async (id: string) => {
    await fetch(`/api/mycelium/signals/${id}/reinforce`, { method: "POST" });
    loadSignals(selected);
    loadTopics();
  }, [loadSignals, loadTopics, selected]);

  const onDropped = useCallback(() => {
    loadTopics();
    loadSignals(selected);
  }, [loadTopics, loadSignals, selected]);

  const triggerDecay = useCallback(async () => {
    if (!devCron) return;
    setDecaying(true);
    const res = await fetch("/api/cron/mycelium-decay", {
      headers: { "x-cron-secret": devCron },
    });
    const json = await res.json();
    setDecaying(false);
    alert(`decay: ${JSON.stringify(json)}`);
    loadSignals(selected);
    loadTopics();
  }, [devCron, loadSignals, loadTopics, selected]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <TopicList topics={topics} selected={selected} onSelect={setSelected} />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
          <header className="flex items-end justify-between">
            <div>
              <h1 className="font-display text-3xl">Mycelium · signal memory</h1>
              <p className="mt-1 text-sm text-ink-2">
                {selected ? `topic: ${selected}` : "select a topic"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="cron secret (dev)"
                value={devCron}
                onChange={(e) => setDevCron(e.target.value)}
                className="h-8 w-44 rounded border border-line bg-canvas-3 px-2 font-mono text-xs text-ink placeholder:text-ink-3"
              />
              <Button size="sm" variant="outline" onClick={triggerDecay} disabled={decaying || !devCron}>
                {decaying ? "decaying…" : "Trigger decay"}
              </Button>
            </div>
          </header>

          <DropForm onDropped={onDropped} />

          <div className="grid gap-3 md:grid-cols-2">
            {signals.map((s) => (
              <SignalCard key={s.id} signal={s} onReinforce={onReinforce} />
            ))}
            {signals.length === 0 && (
              <p className="col-span-full font-mono text-xs text-ink-3">
                no active signals for this topic yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
