import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetaSummary } from "@/lib/patterns/meta";
import { RunDemoSuiteButton } from "@/components/run-demo-suite";

export const revalidate = 30;

export default async function MetaDashboard() {
  const s = await getMetaSummary();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl">Pattern Suite</h1>
          <p className="mt-2 text-sm text-ink-2">
            Five living-systems coordination patterns. Each a live prototype.
          </p>
        </div>
        <RunDemoSuiteButton />
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link href="/app/mycelium">
          <Card className="h-64 transition hover:border-mycelium/60">
            <CardHeader className="flex flex-row items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-mycelium" />
              <CardTitle>Mycelium</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs text-ink-2">
              {s.mycelium.top_signals.length ? s.mycelium.top_signals.map((sig) => (
                <div key={sig.id} className="border-l-2 border-mycelium/50 pl-2">
                  <span className="text-mycelium">[{sig.strength.toFixed(1)}]</span> {sig.body.slice(0, 90)}{sig.body.length > 90 ? "…" : ""}
                  <div className="text-ink-3">· {sig.topic} · {sig.source_agent}</div>
                </div>
              )) : <p className="text-ink-3">no signals yet.</p>}
            </CardContent>
          </Card>
        </Link>

        <Link href="/app/beehive">
          <Card className="h-64 transition hover:border-beehive/60">
            <CardHeader className="flex flex-row items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-beehive" />
              <CardTitle>Beehive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs text-ink-2">
              {s.beehive.latest ? (
                <>
                  <div className="truncate text-ink">{s.beehive.latest.input_url}</div>
                  <div>
                    status: <span className={s.beehive.latest.status === "succeeded" ? "text-colony" : "text-slime"}>{s.beehive.latest.status}</span>
                  </div>
                  {s.beehive.latest.subject && (
                    <div className="border-l-2 border-beehive/50 pl-2 text-ink">
                      → {s.beehive.latest.subject}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-ink-3">no runs yet.</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/app/colony">
          <Card className="h-64 transition hover:border-colony/60">
            <CardHeader className="flex flex-row items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-colony" />
              <CardTitle>Ant Colony</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs text-ink-2">
              {s.colony.latest ? (
                <>
                  <div className="text-ink">
                    {s.colony.latest.market_query} · {s.colony.latest.completed_count}/{s.colony.latest.target_count}
                  </div>
                  {s.colony.latest.clusters.map((c, i) => (
                    <div key={i} className="border-l-2 border-colony/50 pl-2">
                      {c.theme} <span className="text-ink-3">· {c.size}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-ink-3">no jobs yet.</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/app/murmuration">
          <Card className="h-64 transition hover:border-murmuration/60">
            <CardHeader className="flex flex-row items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-murmuration" />
              <CardTitle>Murmuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs text-ink-2">
              {s.murmuration.latest ? (
                <>
                  <div className="truncate text-ink">{s.murmuration.latest.prompt.slice(0, 70)}…</div>
                  {s.murmuration.latest.top_variants.slice(0, 3).map((v, i) => (
                    <div key={i} className="border-l-2 border-murmuration/50 pl-2">
                      {v.slice(0, 90)}{v.length > 90 ? "…" : ""}
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-ink-3">no flocks yet.</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/app/slime">
          <Card className="h-64 transition hover:border-slime/60">
            <CardHeader className="flex flex-row items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-slime" />
              <CardTitle>Slime Mold</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs text-ink-2">
              {s.slime.latest ? (
                <>
                  <div className="text-ink">
                    cycle {s.slime.latest.current_cycle}/{s.slime.latest.cycles_planned} · {s.slime.latest.alive.length} alive
                  </div>
                  {s.slime.latest.alive.slice(0, 3).map((c, i) => (
                    <div key={i} className="border-l-2 border-slime/50 pl-2 text-ink">
                      {c.hypothesis} <span className="text-ink-3">· {c.score?.toFixed(0) ?? "–"}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-ink-3">no selections yet.</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Card className="flex h-64 items-center justify-center border-dashed">
          <CardContent className="text-center">
            <p className="font-display text-sm text-ink-2">
              Two humans + Computer.
            </p>
            <p className="mt-1 font-mono text-[10px] text-ink-3">
              unicron.systems · 2026
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
