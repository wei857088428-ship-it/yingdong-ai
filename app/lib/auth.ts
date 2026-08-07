import "server-only";

import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Paid resources are only available to verified identities. This also
  // protects deployments where Supabase email confirmation was accidentally
  // relaxed in the dashboard.
  const identityConfirmed = user.email
    ? Boolean(user.email_confirmed_at)
    : user.phone
      ? Boolean(user.phone_confirmed_at)
      : false;

  return identityConfirmed ? user : null;
}
