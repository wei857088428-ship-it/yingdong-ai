import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function copyRequiredHeaders(response: NextResponse, headers: Record<string, string>) {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
}

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          copyRequiredHeaders(response, headers);
        },
      },
    },
  );

  try {
    const { data, error } = await supabase.auth.getClaims();
    response.headers.set("Cache-Control", "private, no-store");
    return { response, authenticated: !error && Boolean(data?.claims?.sub) };
  } catch {
    // Fail closed when the auth service or configuration is unavailable.
    response.headers.set("Cache-Control", "private, no-store");
    return { response, authenticated: false };
  }
}
