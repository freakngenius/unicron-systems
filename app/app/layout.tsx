import type { Metadata } from "next";
import { TopNav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Unicron · pattern suite",
  description: "Five living-systems coordination patterns, running live.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <TopNav />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
