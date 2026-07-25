import { supabaseServer } from "@/lib/supabase-server";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import { resolvePatientId, markConsented } from "@/lib/patients";

export async function GET() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return Response.json({ consented: false });

  const admin = requireSupabaseAdmin();
  const { data: patient } = await admin
    .from("patients")
    .select("consented_at")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  return Response.json({ consented: Boolean(patient?.consented_at) });
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const patientId = await resolvePatientId({ authenticator: "supabase", principalId: data.user.id });
  await markConsented(patientId);
  return Response.json({ consented: true });
}
