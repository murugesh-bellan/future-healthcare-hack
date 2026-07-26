import { supabaseServer } from "@/lib/supabase-server";
import type { BaselineDriftRow, CheckInRow, FrailtyAssessmentRow, ScoreDecompositionRow, StrengthScoreRow } from "@/lib/database-types";
import type { DataSource, DecompositionSummary, DriftSummary, FrailtySummary, PatientProfile } from "@/lib/types";
import { getWeightsForConstruct } from "@/lib/contribution-weights";
import { getEvidence } from "@/lib/clinical-evidence";
import mockData from "@/lib/mock-data.json";
import { findPatient } from "@/lib/prometheux-patients";

// mockData.drift is a generic, unrelated fixture (hardcoded "recovering") —
// using it here produced a "trending up, nice momentum" Trend Insight card
// on top of a Trends page showing a real decline. This derives the same
// summary from SP01's real, already-computed Prometheux drift fields
// instead (see lib/prometheux-patients.ts), so the two agree. SP01, not
// SP04, to match lib/trend-data.ts's sample patient: SP04's real history has
// a single-step ~28-point drop that renders as an unrealistic cliff — real
// sarcopenic decline is gradual, and SP01's real history (same
// "deteriorating" direction, changePoint=false) actually is.
const SAMPLE_PATIENT = findPatient("SP01")!;
const SAMPLE_DRIFT: DriftSummary = {
  direction: SAMPLE_PATIENT.direction,
  changePointDetected: SAMPLE_PATIENT.changePoint,
  trendSlope: SAMPLE_PATIENT.slope,
  zScore: Math.round((SAMPLE_PATIENT.maxDrop / SAMPLE_PATIENT.mad) * 100) / 100,
};

// age/sex/height/weight aren't in the Prometheux pull (it's check-in scores
// only) — this is placeholder demo-profile data, same category as any
// mockup's "Jane Doe, 34", always labeled "Sample data" like every other
// fallback in this app. enrolledDate and cohort are real, though: enrolledDate
// is SP01's actual first check-in date, and cohort matches the programme
// context already shown elsewhere for this speaker (lib/prometheux-patients.ts).
const SAMPLE_PROFILE: PatientProfile = {
  age: 58,
  sex: "Female",
  heightCm: 162,
  weightKg: 78,
  enrolledDate: SAMPLE_PATIENT.history[0].date,
  cohort: "GLP-1 weight-management programme",
};

export type { DecompositionSummary, DriftSummary, FrailtySummary } from "@/lib/types";

/**
 * Loads the signed-in patient's profile fields (age, sex, height, weight,
 * enrollment date, cohort) for the Trends "Patient Profile" card. Falls
 * back to bundled sample data whenever there's no session, no patient
 * record, or the query fails — same pattern as every other loader here.
 */
export async function loadPatientProfile(): Promise<{ profile: PatientProfile; source: DataSource }> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient, error } = await supabase
      .from("patients")
      .select("age, sex, height_cm, weight_kg, enrolled_date, cohort")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!patient) throw new Error("No patient record yet.");

    return {
      profile: {
        age: patient.age,
        sex: patient.sex,
        heightCm: patient.height_cm,
        weightKg: patient.weight_kg,
        enrolledDate: patient.enrolled_date,
        cohort: patient.cohort,
      },
      source: "live",
    };
  } catch {
    return { profile: SAMPLE_PROFILE, source: "sample" };
  }
}

/**
 * Loads the most recent check-in's strength-score decomposition — the
 * "why this score" explainability layer (score_decompositions). Falls back
 * to bundled sample data (reported in `source`) whenever there's no session,
 * no patient, no strength_scores row yet, or the query fails.
 */
export async function loadLatestDecomposition(): Promise<{ decomposition: DecompositionSummary | null; source: DataSource }> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!patient) throw new Error("No patient record yet.");

    const { data: latest, error: latestError } = await supabase
      .from("strength_scores")
      .select("id, value, confidence")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest) throw new Error("No strength score yet.");

    const score = latest as Pick<StrengthScoreRow, "id" | "value" | "confidence">;
    const { data: rows, error: rowsError } = await supabase
      .from("score_decompositions")
      .select("subsystem, contribution, weight")
      .eq("score_id", score.id);
    if (rowsError) throw rowsError;

    const decompositionRows = (rows ?? []) as Pick<ScoreDecompositionRow, "subsystem" | "contribution" | "weight">[];
    if (decompositionRows.length === 0) throw new Error("No decomposition rows yet.");

    return {
      decomposition: {
        scoreValue: score.value,
        confidence: score.confidence,
        rows: decompositionRows.map((r) => ({
          subsystem: r.subsystem,
          contribution: r.contribution ?? 0,
          weight: r.weight ?? 0,
        })),
      },
      source: "live",
    };
  } catch {
    return { decomposition: mockData.decomposition as DecompositionSummary, source: "sample" };
  }
}

/**
 * Loads the most recent within-person trend read (baseline_drifts) for the
 * strength_score construct. Falls back to bundled sample data whenever
 * there's no session, no patient, no drift row yet, or the query fails.
 */
export async function loadLatestDrift(): Promise<{ drift: DriftSummary | null; source: DataSource }> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!patient) throw new Error("No patient record yet.");

    const { data: latest, error } = await supabase
      .from("baseline_drifts")
      .select("direction, change_point_detected, trend_slope, z_score")
      .eq("patient_id", patient.id)
      .eq("construct_name", "strength_score")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!latest) throw new Error("No drift row yet.");

    const row = latest as Pick<BaselineDriftRow, "direction" | "change_point_detected" | "trend_slope" | "z_score">;
    if (!row.direction) throw new Error("Drift row missing direction.");

    return {
      drift: {
        direction: row.direction,
        changePointDetected: row.change_point_detected,
        trendSlope: row.trend_slope,
        zScore: row.z_score,
      },
      source: "live",
    };
  } catch {
    return { drift: SAMPLE_DRIFT, source: "sample" };
  }
}

/** Provenance for the frailty axes: whichever contribution_weight row feeding muscle_integrity_index actually has a citation. */
function frailtyCitation(): FrailtySummary["citation"] {
  const cited = getWeightsForConstruct("muscle_integrity_index").find((r) => r.citationId);
  if (!cited?.citationId) return null;
  const evidence = getEvidence(cited.citationId);
  if (!evidence) return null;
  return { source: evidence.source, finding: evidence.finding, url: evidence.url };
}

/**
 * Loads the two clinical frailty axes (frailty_assessments) from the most
 * recent check-in that has them, plus their citation provenance.
 *
 * Sample data is used ONLY when Supabase itself isn't configured in this
 * environment (supabaseServer() throws) — that's the sole case where there
 * is structurally no live backend to query, i.e. a demo/preview deployment.
 * Every other outcome — no session, an auth error, no patient record yet, a
 * failed query, or genuinely no frailty data yet — returns `frailty: null`.
 * This is a clinically-framed risk indicator: an auth hiccup or a transient
 * database error for a real signed-in patient must never be misread as "no
 * data, show the demo numbers instead" and surface a fabricated result.
 */
export async function loadLatestFrailty(): Promise<{ frailty: FrailtySummary | null; source: DataSource }> {
  let supabase;
  try {
    supabase = await supabaseServer();
  } catch {
    return { frailty: mockData.frailty as FrailtySummary, source: "sample" };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return { frailty: null, source: "live" };

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (patientError) throw patientError;
    if (!patient) return { frailty: null, source: "live" };
    const patientId = patient.id;

    const { data: checkIns, error: checkInsError } = await supabase
      .from("check_ins")
      .select("id, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (checkInsError) throw checkInsError;

    const recentCheckIns = (checkIns ?? []) as Pick<CheckInRow, "id" | "created_at">[];
    if (recentCheckIns.length === 0) return { frailty: null, source: "live" };

    const { data: assessments, error: assessmentsError } = await supabase
      .from("frailty_assessments")
      .select("check_in_id, axis, coefficient_contribution, confidence")
      .in(
        "check_in_id",
        recentCheckIns.map((r) => r.id),
      );
    if (assessmentsError) throw assessmentsError;

    const byCheckIn = new Map<
      string,
      Pick<FrailtyAssessmentRow, "axis" | "coefficient_contribution" | "confidence">[]
    >();
    for (const row of (assessments ?? []) as Pick<
      FrailtyAssessmentRow,
      "check_in_id" | "axis" | "coefficient_contribution" | "confidence"
    >[]) {
      const list = byCheckIn.get(row.check_in_id) ?? [];
      list.push(row);
      byCheckIn.set(row.check_in_id, list);
    }

    // recentCheckIns is newest-first; find the first (most recent) one that actually has frailty data.
    const latestWithData = recentCheckIns.find((r) => byCheckIn.has(r.id));
    if (!latestWithData) return { frailty: null, source: "live" };

    return {
      frailty: {
        axes: byCheckIn.get(latestWithData.id)!.map((a) => ({
          axis: a.axis,
          coefficientContribution: a.coefficient_contribution,
          confidence: a.confidence,
        })),
        citation: frailtyCitation(),
      },
      source: "live",
    };
  } catch (err) {
    console.error("Failed to load frailty assessment:", err instanceof Error ? err.message : err);
    return { frailty: null, source: "live" };
  }
}
