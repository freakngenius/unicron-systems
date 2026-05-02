import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: [
    "/app/:path*",
    "/api/mycelium/:path*",
    "/api/beehive/:path*",
    "/api/colony/:path*",
    "/api/murmuration/:path*",
    "/api/slime/:path*",
    "/api/cron/:path*",
    "/api/demo/:path*",
  ],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cron endpoints: accept either `Authorization: Bearer <CRON_SECRET>`
  // (Vercel Cron's default header) or `x-cron-secret: <CRON_SECRET>`
  // for easy curl testing. Skip cookie gate.
  if (pathname.startsWith("/api/cron/")) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";
    const xs = req.headers.get("x-cron-secret") ?? "";
    const fromAuth = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!secret || (fromAuth !== secret && xs !== secret)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Public reads of pattern APIs allowed; only gate mutating methods.
  if (pathname.startsWith("/api/")) {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
      return NextResponse.next();
    }
  }

  const passcode = req.cookies.get("unicron-admin")?.value;
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/gate";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
