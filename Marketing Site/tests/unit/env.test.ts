import { describe, it, expect } from "vitest";

describe("env validation", () => {
  it("loads required keys from .env.local via test setup", async () => {
    const { env } = await import("@/lib/env");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^https:\/\//);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length).toBeGreaterThan(20);
  });

  it("requireServerEnv throws on missing key", async () => {
    const { requireServerEnv } = await import("@/lib/env");
    // Force-unset a key via object key that isn't in the schema
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => requireServerEnv("ANTHROPIC_API_KEY")).toThrow(/Missing/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
