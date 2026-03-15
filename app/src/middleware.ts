import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight auth middleware.
 *
 * Only checks for the existence of the session cookie -- actual token
 * validation happens in route handlers via `getAuthFromRequest()`.
 * This keeps the middleware fast (no DB calls at the edge).
 */

const COOKIE_NAME = "nonzero-session";

const PUBLIC_PATHS = ["/login", "/signup"];

function isPublicPath(pathname: string): boolean {
  // Exact public pages
  if (PUBLIC_PATHS.includes(pathname)) return true;

  // Auth API endpoints
  if (pathname.startsWith("/api/auth/")) return true;

  // Health check
  if (pathname === "/api/health") return true;

  // Next.js internals and static assets
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;

  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let public routes through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;

  if (!sessionCookie) {
    // API routes get a 401 JSON response
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Page routes redirect to login
    const base = process.env.NEXTAUTH_URL || req.url;
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all routes except static files.
     * The negative lookahead excludes _next/static, _next/image, and
     * common static file extensions so middleware is not invoked for them.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
