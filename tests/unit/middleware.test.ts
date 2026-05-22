// tests/unit/middleware.test.ts
//
// Host-rewrite checks for the edge middleware. Covers:
//   - Funder host (regression for commit b00f11f #460)
//   - Internal host (Stage 3 of internal-onboarding, this PR)
//
// We invoke the middleware with a fabricated NextRequest and assert the
// rewrite target URL. The rewrite target is read off the
// `x-middleware-rewrite` response header that NextResponse.rewrite()
// sets in edge runtime.

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function makeReq(host: string, pathname: string, search = ""): NextRequest {
  const url = `https://${host}${pathname}${search}`;
  return new NextRequest(new Request(url), {
    headers: { host },
  } as unknown as ConstructorParameters<typeof NextRequest>[1]);
}

function rewriteTarget(res: Response | undefined): string | null {
  if (!res) return null;
  return res.headers.get("x-middleware-rewrite");
}

describe("middleware: funder.unicron.systems host (regression)", () => {
  it("rewrites bare / to /pathfinder/funder", () => {
    const res = middleware(makeReq("funder.unicron.systems", "/"));
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/funder$/,
    );
  });

  it("rewrites /leads to /pathfinder/leads", () => {
    const res = middleware(makeReq("funder.unicron.systems", "/leads"));
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/leads$/,
    );
  });

  it("passes through /pathfinder/* paths unchanged in shape", () => {
    const res = middleware(
      makeReq("funder.unicron.systems", "/pathfinder/funder"),
    );
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/funder$/,
    );
  });

  it("preserves query string", () => {
    const res = middleware(
      makeReq("funder.unicron.systems", "/leads", "?priority=hot"),
    );
    expect(rewriteTarget(res as Response)).toContain("?priority=hot");
  });
});

describe("middleware: internal.unicron.systems host (Stage 3)", () => {
  it("rewrites bare / to /pathfinder/internal", () => {
    const res = middleware(makeReq("internal.unicron.systems", "/"));
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/internal$/,
    );
  });

  it("rewrites /settings to /pathfinder/settings", () => {
    const res = middleware(makeReq("internal.unicron.systems", "/settings"));
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/settings$/,
    );
  });

  it("rewrites /leads/abc-123 (deep path) to /pathfinder/leads/abc-123", () => {
    const res = middleware(
      makeReq("internal.unicron.systems", "/leads/abc-123"),
    );
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/leads\/abc-123$/,
    );
  });

  it("passes /pathfinder/internal/* paths through unchanged in shape", () => {
    const res = middleware(
      makeReq("internal.unicron.systems", "/pathfinder/internal/leads"),
    );
    expect(rewriteTarget(res as Response)).toMatch(
      /pathfinder-ashy\.vercel\.app\/pathfinder\/internal\/leads$/,
    );
  });

  it("preserves query string on deep paths", () => {
    const res = middleware(
      makeReq("internal.unicron.systems", "/pipeline", "?stage=qualified"),
    );
    expect(rewriteTarget(res as Response)).toContain("?stage=qualified");
  });
});
