import Link from "next/link";
import { cn } from "@/lib/cn";

export const PATTERNS = [
  { slug: "mycelium", label: "Mycelium", color: "bg-mycelium" },
  { slug: "beehive", label: "Beehive", color: "bg-beehive" },
  { slug: "colony", label: "Ant Colony", color: "bg-colony" },
  { slug: "murmuration", label: "Murmuration", color: "bg-murmuration" },
  { slug: "slime", label: "Slime Mold", color: "bg-slime" },
] as const;

export function TopNav() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-canvas-2 px-6">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="font-display text-lg tracking-wide text-ink hover:text-ink-2"
        >
          Unicron
        </Link>
        <a
          href="https://unicron-paradigm-map.netlify.app"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-ink-3 hover:text-ink-2"
        >
          paradigm map ↗
        </a>
      </div>
      <nav className="flex items-center gap-1">
        <Link
          href="/app"
          className="px-3 py-1 text-sm text-ink-2 hover:text-ink"
        >
          Meta
        </Link>
        {PATTERNS.map((p) => (
          <Link
            key={p.slug}
            href={`/app/${p.slug}`}
            className="group flex items-center gap-2 rounded-md px-3 py-1 text-sm text-ink-2 hover:bg-canvas-3 hover:text-ink"
          >
            <span className={cn("h-2 w-2 rounded-full", p.color)} />
            {p.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
