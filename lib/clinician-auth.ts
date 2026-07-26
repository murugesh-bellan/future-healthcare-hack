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
 *
 * When Supabase isn't configured at all, this is a no-op rather than a
 * throw: supabaseServer() would otherwise throw synchronously here, which
 * breaks static prerendering of /clinician at build time (not just runtime),
 * and would block the entire clinician view with zero backend configured —
 * the clinician data itself (lib/prometheux-patients.ts) has no live-auth
 * dependency by design, so the gate shouldn't impose one either in that case.
 */
export async function requireClinician(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
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
