import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import { resolvePatientId } from "@/lib/patients";

export default defineTool({
  description:
    "Save a consented patient check-in transcript. The patient's identity comes from the active session, not from input. Requires consent: call confirm_consent first if the patient has not consented yet.",
  inputSchema: z.object({
    text: z.string().min(1).max(5000),
    channel: z.enum(["web", "whatsapp"]),
  }),
  async execute({ text, channel }, ctx) {
    const principal = ctx.session.auth.current;
    if (!principal) throw new Error("No authenticated caller for this session.");

    const patientId = await resolvePatientId(principal);
    const supabase = requireSupabaseAdmin();

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("consented_at")
      .eq("id", patientId)
      .single();
    if (patientError) throw new Error(patientError.message);
    if (!patient.consented_at) {
      throw new Error("Consent not confirmed yet. Call confirm_consent after the patient agrees, then retry.");
    }

    const { error } = await supabase.from("check_ins").insert({
      patient_id: patientId,
      transcript: text,
      channel,
    });
    if (error) throw new Error(error.message);
    return { saved: true };
  },
});
