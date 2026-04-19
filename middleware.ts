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

const CRON_HEADER = "x-cron-secret";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cron endpoints: require CRON_SECRET header, skip cookie gate.
  if (pathname.startsWith("/api/cron/")) {
    const sent = req.headers.get(CRON_HEADER);
    if (!sent || sent !== process.env.CRON_SECRET) {
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
