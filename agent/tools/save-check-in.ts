import type { SupabaseClient } from "@supabase/supabase-js";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import { resolvePatientId } from "@/lib/patients";
import { scoreCheckIn, type RawScoringFeatures } from "@/lib/scoring";
import { computeBaseline, computeLongitudinal } from "@/lib/baseline-data";
import type { StrengthScoreRow } from "@/lib/database-types";

const voiceSignalsSchema = z
  .object({
    meanPitchHz: z.number().nullable().optional(),
    pitchStdHz: z.number().nullable().optional(),
    f0Cv: z.number().nullable().optional(),
    jitterPercent: z.number().nullable().optional(),
    shimmerPercent: z.number().nullable().optional(),
    zcr: z.number().optional(),
    hnrDb: z.number().nullable().optional(),
    alphaRatioDb: z.number().optional(),
    meanEnergyRms: z.number().nullable().optional(),
    energyNormalized: z.number().optional(),
    pauseRatio: z.number().nullable().optional(),
    voicedRatio: z.number().optional(),
    speechRateWpm: z.number().nullable().optional(),
    speechRateSyllPerSec: z.number().nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
    voicedSegmentDurationSeconds: z.number().nullable().optional(),
    signalQuality: z.enum(["high", "medium", "low"]).optional(),
  })
  .optional();

type VoiceSignalsInput = NonNullable<z.infer<typeof voiceSignalsSchema>>;

/** Maps the client-side VoiceSignals shape onto acoustic_biomarkers feature rows (one row per feature). */
function toAcousticBiomarkerRows(checkInId: string, voiceSignals: VoiceSignalsInput) {
  const features: { feature_name: string; raw_value: number | null; units: string | null }[] = [
    { feature_name: "F0", raw_value: voiceSignals.meanPitchHz ?? null, units: "Hz" },
    { feature_name: "F0_std", raw_value: voiceSignals.pitchStdHz ?? null, units: "Hz" },
    { feature_name: "F0cv", raw_value: voiceSignals.f0Cv ?? null, units: "ratio" },
    { feature_name: "Jitter", raw_value: voiceSignals.jitterPercent ?? null, units: "%" },
    { feature_name: "Shimmer", raw_value: voiceSignals.shimmerPercent ?? null, units: "%" },
    { feature_name: "Zcr", raw_value: voiceSignals.zcr ?? null, units: "ratio" },
    { feature_name: "Hnr", raw_value: voiceSignals.hnrDb ?? null, units: "dB" },
    { feature_name: "AlphaRatio", raw_value: voiceSignals.alphaRatioDb ?? null, units: "dB" },
    { feature_name: "Loudness", raw_value: voiceSignals.meanEnergyRms ?? null, units: "rms" },
    { feature_name: "EnergyNormalized", raw_value: voiceSignals.energyNormalized ?? null, units: "ratio" },
    { feature_name: "PauseRatio", raw_value: voiceSignals.pauseRatio ?? null, units: "ratio" },
    { feature_name: "VoicedRatio", raw_value: voiceSignals.voicedRatio ?? null, units: "ratio" },
    { feature_name: "SpeechRate", raw_value: voiceSignals.speechRateWpm ?? null, units: "wpm" },
    { feature_name: "SpeechRateSyllPerSec", raw_value: voiceSignals.speechRateSyllPerSec ?? null, units: "syll/s" },
    { feature_name: "RecordingDuration", raw_value: voiceSignals.durationSeconds ?? null, units: "s" },
    { feature_name: "VoicedSegmentDuration", raw_value: voiceSignals.voicedSegmentDurationSeconds ?? null, units: "s" },
  ];
  return features
    .filter((f) => f.raw_value !== null)
    .map((f) => ({ check_in_id: checkInId, ...f }));
}

/**
 * Maps the client-side VoiceSignals shape onto the scoring pipeline's
 * raw-feature input. A field a client didn't send means "not measured," so
 * it must pass through as null (skipping whatever construct needs it) —
 * never a fabricated 0, which for features like voicedRatio/energyNormalized
 * reads as a measured pathological extreme rather than an absence of data.
 */
function toRawScoringFeatures(voiceSignals: VoiceSignalsInput): RawScoringFeatures {
  return {
    zcr: voiceSignals.zcr ?? null,
    jitterPercent: voiceSignals.jitterPercent ?? null,
    shimmerPercent: voiceSignals.shimmerPercent ?? null,
    f0Cv: voiceSignals.f0Cv ?? null,
    hnrDb: voiceSignals.hnrDb ?? null,
    voicedRatio: voiceSignals.voicedRatio ?? null,
    pauseRatio: voiceSignals.pauseRatio ?? null,
    energyNormalized: voiceSignals.energyNormalized ?? null,
    speechRateSyllPerSec: voiceSignals.speechRateSyllPerSec ?? null,
    alphaRatioDb: voiceSignals.alphaRatioDb ?? null,
    // Unlike the numeric features above, defaulting unknown quality to "low" is the
    // correct conservative choice — it downgrades confidence rather than fabricating a value.
    signalQuality: voiceSignals.signalQuality ?? "low",
  };
}

const STRENGTH_SCORE_CONSTRUCT_NAME = "strength_score";

/**
 * Recomputes this speaker's strength_score baseline and trend from their full
 * history and upserts/appends the result — mirrors the .vada engine's
 * strength_baseline/strength_longitudinal, which are pure aggregates over the
 * whole series rather than incrementally maintained.
 */
async function updateBaselineAndLongitudinal(supabase: SupabaseClient, patientId: string): Promise<void> {
  const { data, error } = await supabase
    .from("strength_scores")
    .select("value, created_at")
    .eq("patient_id", patientId);
  if (error) {
    console.error("Failed to load strength score history:", error.message);
    return;
  }

  const scores = (data ?? []) as Pick<StrengthScoreRow, "value" | "created_at">[];
  const history = scores.map((s) => ({ value: s.value, createdAt: s.created_at }));
  const baseline = computeBaseline(history);
  if (!baseline) return;
  const longitudinal = computeLongitudinal(history, baseline);

  const { error: baselineError } = await supabase.from("longitudinal_baselines").upsert(
    {
      patient_id: patientId,
      construct_name: STRENGTH_SCORE_CONSTRUCT_NAME,
      rolling_mean: baseline.mean,
      mad: baseline.mad,
      check_in_count: baseline.count,
      first_check_in_at: baseline.firstCheckInAt,
      last_check_in_at: baseline.lastCheckInAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id,construct_name" },
  );
  if (baselineError) console.error("Failed to save longitudinal baseline:", baselineError.message);

  const { error: driftError } = await supabase.from("baseline_drifts").insert({
    patient_id: patientId,
    construct_name: STRENGTH_SCORE_CONSTRUCT_NAME,
    z_score: longitudinal.latestZScore,
    trend_slope: longitudinal.slope,
    direction: longitudinal.direction,
    max_drop: longitudinal.maxDrop,
    change_point_detected: longitudinal.changePoint,
  });
  if (driftError) console.error("Failed to save baseline drift:", driftError.message);
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
      // Voice signals and everything derived from them are supplementary telemetry —
      // failures here must never fail the check-in itself.
      try {
        const rows = toAcousticBiomarkerRows(checkIn.id, voiceSignals);
        if (rows.length > 0) {
          const { error: signalsError } = await supabase.from("acoustic_biomarkers").insert(rows);
          if (signalsError) console.error("Failed to save acoustic biomarkers:", signalsError.message);
        }

        if (voiceSignals.signalQuality) {
          const { error: contextError } = await supabase
            .from("recording_contexts")
            .insert({ check_in_id: checkIn.id, signal_quality: voiceSignals.signalQuality });
          if (contextError) console.error("Failed to save recording context:", contextError.message);
        }

        const result = scoreCheckIn(toRawScoringFeatures(voiceSignals));

        if (result.constructs.length > 0) {
          const { error: constructsError } = await supabase.from("physiological_constructs").insert(
            result.constructs.map((c) => ({
              check_in_id: checkIn.id,
              name: c.name,
              value: c.value,
              confidence: c.confidence,
              formula: c.formula,
            })),
          );
          if (constructsError) console.error("Failed to save physiological constructs:", constructsError.message);
        }

        if (result.functionalCapacity) {
          const { error: fcError } = await supabase.from("functional_biomarkers").insert({
            check_in_id: checkIn.id,
            name: "functional_capacity",
            value: result.functionalCapacity.value,
            formula: result.functionalCapacity.formula,
          });
          if (fcError) console.error("Failed to save functional_capacity:", fcError.message);
        }

        if (result.frailty.length > 0) {
          const { error: frailtyError } = await supabase.from("frailty_assessments").insert(
            result.frailty.map((axis) => ({
              check_in_id: checkIn.id,
              axis: axis.axis,
              coefficient_contribution: axis.coefficientContribution,
              confidence: axis.confidence,
            })),
          );
          if (frailtyError) console.error("Failed to save frailty assessments:", frailtyError.message);
        }

        if (result.strengthScore) {
          const { data: scoreRow, error: scoreError } = await supabase
            .from("strength_scores")
            .insert({
              check_in_id: checkIn.id,
              patient_id: patientId,
              value: result.strengthScore.value,
              confidence: result.strengthScore.confidence,
            })
            .select("id")
            .single();
          if (scoreError) {
            console.error("Failed to save strength score:", scoreError.message);
          } else {
            if (result.decomposition.length > 0) {
              const { error: decompError } = await supabase.from("score_decompositions").insert(
                result.decomposition.map((d) => ({
                  score_id: scoreRow.id,
                  subsystem: d.subsystem,
                  contribution: d.contribution,
                  weight: d.weight,
                })),
              );
              if (decompError) console.error("Failed to save score decomposition:", decompError.message);
            }
            await updateBaselineAndLongitudinal(supabase, patientId);
          }
        }
      } catch (scoringError) {
        console.error(
          "Failed to score check-in:",
          scoringError instanceof Error ? scoringError.message : scoringError,
        );
      }
    }

    return { saved: true };
  },
});
