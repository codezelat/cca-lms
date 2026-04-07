import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;
  const hasSessionCookie = !!sessionToken;

  // Root path - redirect to login or dashboard based on auth status
  if (pathname === "/") {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Protected routes
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/programmes") ||
    pathname.startsWith("/students") ||
    pathname.startsWith("/audit-students") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/resources") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/profile");

  // Redirect to login if trying to access protected route while not authenticated
  if (isProtectedRoute && !hasSessionCookie) {
    const callbackUrl = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/auth/login?callbackUrl=${callbackUrl}`, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)",
  ],
};
