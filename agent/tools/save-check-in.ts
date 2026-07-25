import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import { resolvePatientId } from "@/lib/patients";

const voiceSignalsSchema = z
  .object({
    meanPitchHz: z.number().nullable().optional(),
    pitchStdHz: z.number().nullable().optional(),
    jitterPercent: z.number().nullable().optional(),
    shimmerPercent: z.number().nullable().optional(),
    meanEnergyRms: z.number().nullable().optional(),
    pauseRatio: z.number().nullable().optional(),
    speechRateWpm: z.number().nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
  })
  .optional();

/** Maps the client-side VoiceSignals shape onto acoustic_biomarkers feature rows (one row per feature). */
function toAcousticBiomarkerRows(checkInId: string, voiceSignals: NonNullable<z.infer<typeof voiceSignalsSchema>>) {
  const features: { feature_name: string; raw_value: number | null; units: string | null }[] = [
    { feature_name: "F0", raw_value: voiceSignals.meanPitchHz ?? null, units: "Hz" },
    { feature_name: "F0_std", raw_value: voiceSignals.pitchStdHz ?? null, units: "Hz" },
    { feature_name: "Jitter", raw_value: voiceSignals.jitterPercent ?? null, units: "%" },
    { feature_name: "Shimmer", raw_value: voiceSignals.shimmerPercent ?? null, units: "%" },
    { feature_name: "Loudness", raw_value: voiceSignals.meanEnergyRms ?? null, units: "rms" },
    { feature_name: "PauseRatio", raw_value: voiceSignals.pauseRatio ?? null, units: "ratio" },
    { feature_name: "SpeechRate", raw_value: voiceSignals.speechRateWpm ?? null, units: "wpm" },
    { feature_name: "VoicedSegmentDuration", raw_value: voiceSignals.durationSeconds ?? null, units: "s" },
  ];
  return features
    .filter((f) => f.raw_value !== null)
    .map((f) => ({ check_in_id: checkInId, ...f }));
}

export default defineTool({
  description:
    "Save a consented patient check-in transcript. The patient's identity comes from the active session, not from input. Requires consent: call confirm_consent first if the patient has not consented yet. If the client context for this turn includes voice_signals, pass them through unchanged as voiceSignals.",
  inputSchema: z.object({
    text: z.string().min(1).max(5000),
    channel: z.enum(["web", "whatsapp"]),
    voiceSignals: voiceSignalsSchema,
  }),
  async execute({ text, channel, voiceSignals }, ctx) {
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

    const { data: checkIn, error } = await supabase
      .from("check_ins")
      .insert({
        patient_id: patientId,
        transcript: text,
        channel,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (voiceSignals) {
      const rows = toAcousticBiomarkerRows(checkIn.id, voiceSignals);
      if (rows.length > 0) {
        const { error: signalsError } = await supabase.from("acoustic_biomarkers").insert(rows);
        // Voice signals are supplementary telemetry — don't fail the check-in over it.
        if (signalsError) console.error("Failed to save acoustic biomarkers:", signalsError.message);
      }
    }

    return { saved: true };
  },
});
