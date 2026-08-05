import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Get current user failed:", error);
    return null;
  }

  return user;
}