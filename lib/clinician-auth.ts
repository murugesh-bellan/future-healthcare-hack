import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Server-side gate for /clinician routes. Must run before any cohort data is
 * fetched or rendered — the root layout's AnonAuthProvider is a client-side UI
 * gate only (it hides content after hydration, but a Server Component's
 * initial render already happened on the server by then), so it does not
 * restrict who can reach this data. Redirects to "/" for both an
 * unauthenticated caller and an authenticated one who isn't in
 * public.clinicians.
 */
export async function requireClinician(): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: clinician, error } = await supabase
    .from("clinicians")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!clinician) redirect("/");
}
