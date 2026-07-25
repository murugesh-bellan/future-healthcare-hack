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
      const { error: signalsError } = await supabase.from("voice_signals").insert({
        check_in_id: checkIn.id,
        mean_pitch_hz: voiceSignals.meanPitchHz ?? null,
        pitch_std_hz: voiceSignals.pitchStdHz ?? null,
        jitter_percent: voiceSignals.jitterPercent ?? null,
        shimmer_percent: voiceSignals.shimmerPercent ?? null,
        mean_energy_rms: voiceSignals.meanEnergyRms ?? null,
        pause_ratio: voiceSignals.pauseRatio ?? null,
        speech_rate_wpm: voiceSignals.speechRateWpm ?? null,
        duration_seconds: voiceSignals.durationSeconds ?? null,
      });
      // Voice signals are supplementary telemetry — don't fail the check-in over it.
      if (signalsError) console.error("Failed to save voice signals:", signalsError.message);
    }

    return { saved: true };
  },
});
