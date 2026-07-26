import { supabaseServer } from "@/lib/supabase-server";
import type { CheckInRow, PhysiologicalConstructRow, StrengthScoreRow } from "@/lib/database-types";
import type { DataSource, TrendPoint } from "@/lib/types";
import { CONSTRUCT_DISPLAY_NAMES } from "@/lib/physiological-constructs";
import { findPatient } from "@/lib/prometheux-patients";

const WINDOW_DAYS = 90;

// Sample-data fallback is built from SP04's real Prometheux history, not
// generic mock data — without live credentials, every visitor was seeing a
// near-flat placeholder line while the clinician view (lib/prometheux-patients.ts)
// showed the real, dramatic trajectory for the same patient. SP04 has the
// richest real per-construct pull from this session (vocal stability,
// phonation efficiency, fatigue, functional capacity are all real numbers,
// not authored); the other three constructs weren't individually pulled from
// Prometheux this session, so they're derived from the same real functional-
// capacity trajectory with a fixed offset rather than random noise, so the
// *shape* stays authentic even where the exact number isn't independently measured.
const SAMPLE_PATIENT = findPatient("SP04")!;

export interface ConstructTrend {
  name: string;
  displayName: string;
  points: TrendPoint[];
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Frequency-only fallback for days with check-ins but no strength_scores yet (e.g. before any pitch was ever detected). */
function scoreForCount(count: number): number {
  return Math.max(0, Math.min(100, 50 + count * 6));
}

/** Carry-forward-fills SP04's 5 real check-ins across a WINDOW_DAYS span — same logic the live path uses, so the sample fallback isn't a flat placeholder. */
function sampleTrendPoints(): TrendPoint[] {
  const scoreByDay = new Map(SAMPLE_PATIENT.history.map((h) => [h.date, Math.round(h.score)]));
  const firstDate = new Date(SAMPLE_PATIENT.history[0].date);
  let lastKnownScore = Math.round(SAMPLE_PATIENT.history[0].score);

  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = new Date(firstDate);
    d.setDate(d.getDate() + i - Math.floor(WINDOW_DAYS / 4)); // centers the real 8-week span within the window
    const key = dayKey(d);
    const known = scoreByDay.get(key);
    if (known !== undefined) lastKnownScore = known;
    return { date: key, score: lastKnownScore, checkInCount: known !== undefined ? 1 : 0 };
  });
}

/**
 * Loads the signed-in patient's daily Strength Score trend for the last 90
 * days, sourced from the real strength_scores pipeline (lib/scoring.ts).
 * Days without a check-in carry forward the last known score rather than
 * showing a gap; days before any score ever existed fall back to check-in
 * frequency. Falls back to bundled sample data (reported in `source`) when
 * there's no session, no patient, or the query fails.
 */
export async function loadTrend(): Promise<{ points: TrendPoint[]; source: DataSource }> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!patient) throw new Error("No patient record yet.");

    const fetchStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [checkInsResult, scoresResult] = await Promise.all([
      supabase
        .from("check_ins")
        .select("created_at")
        .eq("patient_id", patient.id)
        .gte("created_at", fetchStart.toISOString())
        .order("created_at"),
      // No lower bound: we need the full history to carry the last known score into the window.
      supabase.from("strength_scores").select("value, created_at").eq("patient_id", patient.id).order("created_at"),
    ]);
    if (checkInsResult.error) throw checkInsResult.error;
    if (scoresResult.error) throw scoresResult.error;

    const checkIns = (checkInsResult.data ?? []) as Pick<CheckInRow, "created_at">[];
    const countsByDay = new Map<string, number>();
    for (const row of checkIns) {
      const key = row.created_at.slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const scores = (scoresResult.data ?? []) as Pick<StrengthScoreRow, "value" | "created_at">[];
    const scoresByDay = new Map<string, number[]>();
    let lastKnownScore: number | null = null;
    for (const row of scores) {
      if (new Date(row.created_at) < fetchStart) {
        lastKnownScore = row.value;
        continue;
      }
      const key = row.created_at.slice(0, 10);
      const list = scoresByDay.get(key) ?? [];
      list.push(row.value);
      scoresByDay.set(key, list);
    }

    const today = new Date();
    const points: TrendPoint[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (WINDOW_DAYS - 1 - i));
      const key = dayKey(d);
      const dayScores = scoresByDay.get(key);

      let score: number;
      if (dayScores && dayScores.length > 0) {
        score = Math.round(dayScores.reduce((sum, v) => sum + v, 0) / dayScores.length);
        lastKnownScore = score;
      } else if (lastKnownScore !== null) {
        score = lastKnownScore;
      } else {
        score = scoreForCount(countsByDay.get(key) ?? 0);
      }

      return { date: key, score, checkInCount: countsByDay.get(key) ?? 0 };
    });

    return { points, source: "live" };
  } catch {
    return { points: sampleTrendPoints(), source: "sample" };
  }
}

/**
 * Loads the signed-in patient's physiological-construct history (Vocal
 * Stability, Phonation Efficiency, ...) for the friendly-framing trend cards.
 * These are the same named constructs written by lib/scoring.ts's real
 * scoring pipeline to physiological_constructs — this just groups that same
 * table's rows by construct name for a per-construct trend line, which
 * neither the "Why This Score" decomposition (latest check-in only, 3
 * subsystems) nor the raw biomarker sparklines on the Trends page cover.
 *
 * Falls back to bundled sample data on any error, same pattern as loadTrend.
 */
export async function loadConstructTrends(): Promise<{ constructs: ConstructTrend[]; source: DataSource }> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!patient) throw new Error("No patient record yet.");

    const fetchStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const { data: checkIns, error: checkInsError } = await supabase
      .from("check_ins")
      .select("id, created_at")
      .eq("patient_id", patient.id)
      .gte("created_at", fetchStart.toISOString())
      .order("created_at");
    if (checkInsError) throw checkInsError;

    const rows = (checkIns ?? []) as Pick<CheckInRow, "id" | "created_at">[];
    if (rows.length === 0) throw new Error("No check-ins yet.");

    const checkInDateById = new Map(rows.map((r) => [r.id, r.created_at.slice(0, 10)]));
    const { data: constructRows, error: constructsError } = await supabase
      .from("physiological_constructs")
      .select("check_in_id, name, value")
      .in(
        "check_in_id",
        rows.map((r) => r.id),
      );
    if (constructsError) throw constructsError;

    const byConstruct = new Map<string, TrendPoint[]>();
    for (const row of (constructRows ?? []) as Pick<PhysiologicalConstructRow, "check_in_id" | "name" | "value">[]) {
      const date = checkInDateById.get(row.check_in_id);
      if (!date || row.value === null) continue;
      const points = byConstruct.get(row.name) ?? [];
      points.push({ date, score: Math.round(row.value), checkInCount: 0 });
      byConstruct.set(row.name, points);
    }
    if (byConstruct.size === 0) throw new Error("No construct data yet.");

    const constructs: ConstructTrend[] = Array.from(byConstruct.entries()).map(([name, points]) => ({
      name,
      displayName: CONSTRUCT_DISPLAY_NAMES[name] ?? name,
      points: points.sort((a, b) => a.date.localeCompare(b.date)),
    }));

    return { constructs, source: "live" };
  } catch {
    return { constructs: SAMPLE_CONSTRUCT_TRENDS, source: "sample" };
  }
}

// Real per-construct values pulled from Prometheux for SP04 (see
// docs/prometheux-reasoning-engine.md) — vocal_stability_index and the
// strengthComponent breakdown (functional_capacity, fatigue_index,
// phonation_efficiency) across the same 5 real check-ins used everywhere
// else this patient appears. functional_capacity is the direct real proxy
// for muscle_integrity_index (same subsystem shown in the clinician
// breakdown table). The remaining three constructs weren't individually
// pulled from Prometheux this session, so they're derived from the real
// functional_capacity series with a fixed offset — same authentic shape,
// not independently measured.
const REAL_VOCAL_STABILITY = [56.78, 56.5, 54.51, 30.35, 24.01];
const REAL_PHONATION_EFFICIENCY = [63.646, 63.143, 61.92, 42.114, 37.463];
const REAL_FATIGUE = [78.39, 78.25, 77.255, 15.175, 12.005];
const REAL_FUNCTIONAL_CAPACITY = [90.6125, 90.26, 90.08, 29.7875, 21.0275];

const SAMPLE_CONSTRUCT_SERIES: Record<string, number[]> = {
  muscle_integrity_index: REAL_FUNCTIONAL_CAPACITY,
  vocal_stability_index: REAL_VOCAL_STABILITY,
  phonation_efficiency: REAL_PHONATION_EFFICIENCY,
  fatigue_index: REAL_FATIGUE,
  respiratory_support_index: REAL_FUNCTIONAL_CAPACITY.map((v) => Math.max(10, Math.min(95, v - 5))),
  motor_coordination_index: REAL_FUNCTIONAL_CAPACITY.map((v) => Math.max(10, Math.min(95, v - 12))),
  resonance_stability: REAL_VOCAL_STABILITY.map((v) => Math.max(10, Math.min(95, v + 8))),
};

/** Bundled sample data — the same real, dramatic SP04 trajectory shown in the clinician view, not a generic placeholder. */
const SAMPLE_CONSTRUCT_TRENDS: ConstructTrend[] = Object.entries(CONSTRUCT_DISPLAY_NAMES).map(([name, displayName]) => ({
  name,
  displayName,
  points: SAMPLE_PATIENT.history.map((h, i) => ({
    date: h.date,
    score: Math.round(SAMPLE_CONSTRUCT_SERIES[name][i]),
    checkInCount: 0,
  })),
}));
