import Link from "next/link";
import { PATTERNS } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MetaDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl">Pattern Suite</h1>
        <p className="mt-2 text-sm text-ink-2">
          Five living-systems coordination patterns. Each a live prototype.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PATTERNS.map((p) => (
          <Link key={p.slug} href={`/app/${p.slug}`}>
            <Card className="h-40 transition hover:border-ink-3">
              <CardHeader className="flex flex-row items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${p.color}`} />
                <CardTitle>{p.label}</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-xs text-ink-3">
                coming soon
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
