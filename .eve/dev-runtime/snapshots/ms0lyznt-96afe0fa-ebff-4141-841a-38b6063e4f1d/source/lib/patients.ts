import { requireSupabaseAdmin } from "@/lib/supabase-admin";

export interface CallerPrincipal {
  readonly authenticator: string;
  readonly principalId: string;
}

/**
 * Resolves the patients.id row for an authenticated caller, creating it on first contact.
 * Web callers are keyed by the Supabase auth user id; WhatsApp callers by their WhatsApp user id.
 * Runs with the service-role client, so call it only after the caller's identity is verified
 * (via eve's ctx.session.auth, or the request's own Supabase session).
 */
export async function resolvePatientId(principal: CallerPrincipal): Promise<string> {
  const supabase = requireSupabaseAdmin();
  const column = principal.authenticator === "whatsapp" ? "whatsapp_user_id" : "auth_user_id";

  const { data: existing, error: selectError } = await supabase
    .from("patients")
    .select("id")
    .eq(column, principal.principalId)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);
  if (existing) return existing.id as string;

  const insertQuery =
    column === "whatsapp_user_id"
      ? supabase.from("patients").insert({ whatsapp_user_id: principal.principalId })
      : supabase.from("patients").insert({ auth_user_id: principal.principalId });
  const { data: created, error: insertError } = await insertQuery.select("id").single();
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
