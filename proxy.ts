import { NextRequest, NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/app/lib/supabaseProxy";

function includeSessionCookies(target: NextResponse, sessionResponse: NextResponse) {
  sessionResponse.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = sessionResponse.headers.get(name);
    if (value) target.headers.set(name, value);
  }
  return target;
}

export async function proxy(request: NextRequest) {
  const { response, authenticated } = await refreshSupabaseSession(request);
  if (authenticated) return response;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return includeSessionCookies(NextResponse.json(
      { error: "请先登录" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    ), response);
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return includeSessionCookies(NextResponse.redirect(loginUrl), response);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/characters/:path*",
    "/storyboard/:path*",
    "/episode/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
