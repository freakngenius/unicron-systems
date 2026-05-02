"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateForm />
    </Suspense>
  );
}

function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: value }),
    });
    setPending(false);
    if (res.ok) {
      router.push(next);
    } else {
      setError("Wrong passcode.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-canvas-2 p-6"
      >
        <h1 className="font-display text-2xl">Unicron · admin</h1>
        <p className="text-sm text-ink-2">
          Enter the admin passcode to access the pattern suite.
        </p>
        <Input
          autoFocus
          type="password"
          placeholder="passcode"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="text-xs text-[#d87a7a]">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "checking…" : "Enter"}
        </Button>
      </form>
    </main>
  );
}
