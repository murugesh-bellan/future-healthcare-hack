import { supabaseServer } from "@/lib/supabase-server";
import type { AcousticBiomarkerRow, CheckInRow } from "@/lib/database-types";
import type { DataSource, TrendPoint } from "@/lib/types";
import mockData from "@/lib/mock-data.json";

const WINDOW_DAYS = 90;
const ROLLING_DAYS = 7;

interface SignalFeatures {
  jitterPercent: number | null;
  shimmerPercent: number | null;
  pauseRatio: number | null;
  pitchStdHz: number | null;
  speechRateWpm: number | null;
}

/** Maps acoustic_biomarkers.feature_name onto the SignalFeatures field it feeds. */
const FEATURE_FIELD: Record<string, keyof SignalFeatures> = {
  Jitter: "jitterPercent",
  Shimmer: "shimmerPercent",
  PauseRatio: "pauseRatio",
  F0_std: "pitchStdHz",
  SpeechRate: "speechRateWpm",
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Clamp to [0, 1]. */
function unit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Frequency-only fallback when a window has check-ins but no usable acoustic biomarkers. */
function scoreForCount(count: number): number {
  return Math.max(0, Math.min(100, 50 + count * 6));
}

/**
 * Illustrative Strength Score from acoustic biomarkers — NOT a validated
 * biometric (same caveat as README / elsewhere in this app). Transparent
 * heuristic only: lower jitter/shimmer/pause ratio, steadier pitch, and a
 * conversational speech rate all push the score up. Weights are hand-tuned
 * for demo clarity, not clinically derived.
 */
function scoreFromAcousticBiomarkers(signals: SignalFeatures[]): number {
  const avg = (pick: (s: SignalFeatures) => number | null): number | null => {
    const vals = signals.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const jitter = avg((s) => s.jitterPercent);
  const shimmer = avg((s) => s.shimmerPercent);
  const pause = avg((s) => s.pauseRatio);
  const pitchStd = avg((s) => s.pitchStdHz);
  const wpm = avg((s) => s.speechRateWpm);

  // Each term maps a raw feature onto "goodness" in [0, 1].
  const parts: { weight: number; goodness: number }[] = [];
  if (jitter !== null) parts.push({ weight: 0.25, goodness: unit(1 - jitter / 5) }); // ~0–5% typical
  if (shimmer !== null) parts.push({ weight: 0.25, goodness: unit(1 - shimmer / 20) }); // ~0–20%
  if (pause !== null) parts.push({ weight: 0.2, goodness: unit(1 - pause / 0.55) }); // long silences pull down
  if (pitchStd !== null) parts.push({ weight: 0.15, goodness: unit(1 - pitchStd / 45) }); // steadier pitch
  if (wpm !== null) {
    // Conversational sweet spot ~120–160 wpm; distance from 140 maps to goodness.
    parts.push({ weight: 0.15, goodness: unit(1 - Math.abs(wpm - 140) / 100) });
  }

  if (parts.length === 0) return 55; // neutral when rows exist but features are null

  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  const goodness = parts.reduce((s, p) => s + p.goodness * p.weight, 0) / weightSum;
  // Map goodness into a calm 40–95 band so the ring never looks broken or clinical-maxed.
  return Math.round(40 + goodness * 55);
}

/**
 * Pure: derives the 90-day rolling Strength Score trend from already-fetched
 * check-ins and acoustic biomarkers. Factored out of `loadTrend` so
 * `lib/dashboard-data.ts` can reuse it against a single shared fetch instead
 * of each caller re-querying Supabase independently.
 */
export function deriveTrendPoints(
  checkIns: Pick<CheckInRow, "id" | "created_at">[],
  biomarkers: Pick<AcousticBiomarkerRow, "check_in_id" | "feature_name" | "raw_value">[],
  windowDays: number = WINDOW_DAYS,
  rollingDays: number = ROLLING_DAYS,
): TrendPoint[] {
  const signalsByCheckIn = new Map<string, SignalFeatures>();
  for (const row of biomarkers) {
    const field = FEATURE_FIELD[row.feature_name];
    if (!field || row.raw_value === null) continue;
    const entry = signalsByCheckIn.get(row.check_in_id) ?? {
      jitterPercent: null,
      shimmerPercent: null,
      pauseRatio: null,
      pitchStdHz: null,
      speechRateWpm: null,
    };
    entry[field] = row.raw_value;
    signalsByCheckIn.set(row.check_in_id, entry);
  }

  const countsByDay = new Map<string, number>();
  const signalsByDay = new Map<string, SignalFeatures[]>();
  for (const row of checkIns) {
    const key = row.created_at.slice(0, 10);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    const signal = signalsByCheckIn.get(row.id);
    if (signal) {
      const list = signalsByDay.get(key) ?? [];
      list.push(signal);
      signalsByDay.set(key, list);
    }
  }

  const today = new Date();
  return Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (windowDays - 1 - i));
    const key = dayKey(d);

    let rollingCount = 0;
    const rollingSignals: SignalFeatures[] = [];
    for (let offset = 0; offset < rollingDays; offset++) {
      const rollingDay = new Date(d);
      rollingDay.setDate(rollingDay.getDate() - offset);
      const day = dayKey(rollingDay);
      rollingCount += countsByDay.get(day) ?? 0;
      const daySignals = signalsByDay.get(day);
      if (daySignals) rollingSignals.push(...daySignals);
    }

    let score: number;
    if (rollingSignals.length > 0) {
      // Blend the biomarker heuristic with a light frequency nudge so consistency still matters.
      const biomarkerScore = scoreFromAcousticBiomarkers(rollingSignals);
      const frequency = scoreForCount(rollingCount);
      score = Math.round(biomarkerScore * 0.85 + frequency * 0.15);
    } else if (rollingCount > 0) {
      score = scoreForCount(rollingCount);
    } else {
      score = 50; // neutral baseline — no check-ins in the trailing week
    }

    return {
      date: key,
      score: Math.max(0, Math.min(100, score)),
      checkInCount: countsByDay.get(key) ?? 0,
    };
  });
}

/**
 * Loads the signed-in patient's daily trend for the last 90 days.
 * Strength Score prefers stored `acoustic_biomarkers` (illustrative heuristic);
 * falls back to check-in frequency when a day's rolling window has no usable
 * biomarkers, and to bundled sample data (reported in `source`) when there's
 * no session, no patient, or the query fails — so the UI never has to handle
 * a hard error mid-demo.
 *
 * Standalone entry point (used by the home page). `/trends` uses
 * `loadTrendsPageData` in `lib/dashboard-data.ts` instead, which shares one
 * fetch between this and `loadBiomarkers` rather than each querying separately.
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

    // Fetch an extra `ROLLING_DAYS` of history so the rolling window for the
    // earliest displayed day is fully populated.
    const fetchStart = new Date(Date.now() - (WINDOW_DAYS + ROLLING_DAYS) * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from("check_ins")
      .select("id, created_at")
      .eq("patient_id", patient.id)
      .gte("created_at", fetchStart.toISOString())
      .order("created_at");
    if (error) throw error;

    const checkIns = (data ?? []) as Pick<CheckInRow, "id" | "created_at">[];
    const checkInIds = checkIns.map((row) => row.id);

    let biomarkers: Pick<AcousticBiomarkerRow, "check_in_id" | "feature_name" | "raw_value">[] = [];
    if (checkInIds.length > 0) {
      const { data: biomarkerRows, error: biomarkersError } = await supabase
        .from("acoustic_biomarkers")
        .select("check_in_id, feature_name, raw_value")
        .in("check_in_id", checkInIds)
        .in("feature_name", Object.keys(FEATURE_FIELD));
      if (biomarkersError) throw biomarkersError;
      biomarkers = (biomarkerRows ?? []) as Pick<AcousticBiomarkerRow, "check_in_id" | "feature_name" | "raw_value">[];
    }

    return { points: deriveTrendPoints(checkIns, biomarkers), source: "live" };
  } catch {
    return { points: mockData.trend.points as TrendPoint[], source: "sample" };
  }
}
