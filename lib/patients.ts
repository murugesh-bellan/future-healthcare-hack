import { requireSupabaseAdmin } from "@/lib/supabase-admin";

export interface CallerPrincipal {
  readonly authenticator: string;
  readonly principalId: string;
}

/**
 * Resolves the patients.id row for an authenticated caller, creating it on first contact.
 * Keyed by the Supabase auth user id. Runs with the service-role client, so call it only
 * after the caller's identity is verified (via eve's ctx.session.auth, or the request's
 * own Supabase session).
 */
export async function resolvePatientId(principal: CallerPrincipal): Promise<string> {
  const supabase = requireSupabaseAdmin();

  const { data: existing, error: selectError } = await supabase
    .from("patients")
    .select("id")
    .eq("auth_user_id", principal.principalId)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await supabase
    .from("patients")
    .insert({ auth_user_id: principal.principalId })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return created.id as string;
}

/** Marks a resolved patient as consented. Idempotent. */
export async function markConsented(patientId: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("patients")
    .update({ consented_at: new Date().toISOString() })
    .eq("id", patientId)
    .is("consented_at", null);
  if (error) throw new Error(error.message);
}
