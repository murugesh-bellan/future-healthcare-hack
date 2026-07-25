import { supabaseServer } from "@/lib/supabase-server";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import type { PhysiologicalConstructRow } from "@/lib/database-types";

/**
 * Returns the signed-in patient's most recent check-in and its physiological
 * constructs, for the "what we're assessing" breakdown panel. Called once,
 * right after the check-in agent finishes — the tool call that saves a
 * check-in returns a conversational reply, not structured data, so the
 * frontend fetches this separately rather than parsing it out of the reply.
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ checkIn: null, constructs: [] });

  const admin = requireSupabaseAdmin();
  const { data: patient } = await admin
    .from("patients")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!patient) return Response.json({ checkIn: null, constructs: [] });

  const { data: checkIn } = await admin
    .from("check_ins")
    .select("id, created_at")
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!checkIn) return Response.json({ checkIn: null, constructs: [] });

  const { data: constructs } = await admin
    .from("physiological_constructs")
    .select("name, value, formula, confidence")
    .eq("check_in_id", checkIn.id);

  return Response.json({
    checkIn: { id: checkIn.id, createdAt: checkIn.created_at },
    constructs: (constructs ?? []) as Pick<PhysiologicalConstructRow, "name" | "value" | "formula" | "confidence">[],
  });
}
