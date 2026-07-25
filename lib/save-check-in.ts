import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import { resolvePatientId, type CallerPrincipal } from "@/lib/patients";

export interface VoiceSignalsInput {
  meanPitchHz?: number | null;
  pitchStdHz?: number | null;
  jitterPercent?: number | null;
  shimmerPercent?: number | null;
  meanEnergyRms?: number | null;
  pauseRatio?: number | null;
  speechRateWpm?: number | null;
  durationSeconds?: number | null;
  voicedSegmentDurationSeconds?: number | null;
}

/** Thrown when the resolved patient hasn't consented yet — callers decide how to surface this. */
export class ConsentRequiredError extends Error {
  constructor() {
    super("Consent not confirmed yet. Call confirm_consent after the patient agrees, then retry.");
    this.name = "ConsentRequiredError";
  }
}

/** Maps the client-side VoiceSignals shape onto acoustic_biomarkers feature rows (one row per feature). */
function toAcousticBiomarkerRows(checkInId: string, voiceSignals: VoiceSignalsInput) {
  const features: { feature_name: string; raw_value: number | null; units: string | null }[] = [
    { feature_name: "F0", raw_value: voiceSignals.meanPitchHz ?? null, units: "Hz" },
    { feature_name: "F0_std", raw_value: voiceSignals.pitchStdHz ?? null, units: "Hz" },
    { feature_name: "Jitter", raw_value: voiceSignals.jitterPercent ?? null, units: "%" },
    { feature_name: "Shimmer", raw_value: voiceSignals.shimmerPercent ?? null, units: "%" },
    { feature_name: "Loudness", raw_value: voiceSignals.meanEnergyRms ?? null, units: "rms" },
    { feature_name: "PauseRatio", raw_value: voiceSignals.pauseRatio ?? null, units: "ratio" },
    { feature_name: "SpeechRate", raw_value: voiceSignals.speechRateWpm ?? null, units: "wpm" },
    { feature_name: "RecordingDuration", raw_value: voiceSignals.durationSeconds ?? null, units: "s" },
    { feature_name: "VoicedSegmentDuration", raw_value: voiceSignals.voicedSegmentDurationSeconds ?? null, units: "s" },
  ];
  return features.filter((f) => f.raw_value !== null).map((f) => ({ check_in_id: checkInId, ...f }));
}

/**
 * Shared persistence used by both `agent/tools/save-check-in.ts` (the only
 * path WhatsApp has) and `app/api/check-in/route.ts` (the web direct-save
 * path) — keeps both callers writing identically instead of the logic
 * drifting between a tool and a route handler.
 */
export async function saveCheckIn(params: {
  principal: CallerPrincipal;
  text: string;
  channel: "web" | "whatsapp";
  voiceSignals?: VoiceSignalsInput | null;
}): Promise<{ checkInId: string }> {
  const patientId = await resolvePatientId(params.principal);
  const supabase = requireSupabaseAdmin();

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("consented_at")
    .eq("id", patientId)
    .single();
  if (patientError) throw new Error(patientError.message);
  if (!patient.consented_at) throw new ConsentRequiredError();

  const { data: checkIn, error } = await supabase
    .from("check_ins")
    .insert({
      patient_id: patientId,
      transcript: params.text,
      channel: params.channel,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (params.voiceSignals) {
    const rows = toAcousticBiomarkerRows(checkIn.id, params.voiceSignals);
    if (rows.length > 0) {
      const { error: signalsError } = await supabase.from("acoustic_biomarkers").insert(rows);
      // Voice signals are supplementary telemetry — don't fail the check-in over it.
      if (signalsError) console.error("Failed to save acoustic biomarkers:", signalsError.message);
    }
  }

  return { checkInId: checkIn.id };
}
