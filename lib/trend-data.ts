import { supabaseServer } from "@/lib/supabase-server";
import type { CheckInRow, VoiceSignalRow } from "@/lib/database-types";
import type { DataSource, TrendPoint } from "@/lib/types";
import mockData from "@/lib/mock-data.json";

const WINDOW_DAYS = 90;
const ROLLING_DAYS = 7;

type SignalFeatures = Pick<
  VoiceSignalRow,
  "jitter_percent" | "shimmer_percent" | "pause_ratio" | "pitch_std_hz" | "speech_rate_wpm"
>;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Clamp to [0, 1]. */
function unit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Illustrative Strength Score from acoustic features — NOT a validated biometric
 * (same caveat as README / elsewhere in this app). Transparent heuristic only:
 * lower jitter / shimmer / pause ratio → higher; steadier pitch and a
 * conversational speech rate → higher. Weights are hand-tuned for demo clarity.
 */
function scoreFromVoiceFeatures(signals: SignalFeatures[]): number {
  const avg = (pick: (s: SignalFeatures) => number | null): number | null => {
    const vals = signals.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const jitter = avg((s) => s.jitter_percent);
  const shimmer = avg((s) => s.shimmer_percent);
  const pause = avg((s) => s.pause_ratio);
  const pitchStd = avg((s) => s.pitch_std_hz);
  const wpm = avg((s) => s.speech_rate_wpm);

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

/** Frequency-only fallback when a window has check-ins but no usable voice_signals. */
function scoreForCount(count: number): number {
  return Math.max(0, Math.min(100, 50 + count * 6));
}

/**
 * Loads the signed-in patient's daily trend for the last 90 days.
 * Strength Score prefers stored `voice_signals` (illustrative heuristic);
 * falls back to check-in frequency when signals are missing, and to bundled
 * sample data (reported in `source`) when there's no session, no patient, or
 * the query fails — so the UI never has to handle a hard error mid-demo.
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

    const signalsByCheckIn = new Map<string, SignalFeatures>();
    if (checkInIds.length > 0) {
      const { data: signals, error: signalsError } = await supabase
        .from("voice_signals")
        .select("check_in_id, jitter_percent, shimmer_percent, pause_ratio, pitch_std_hz, speech_rate_wpm")
        .in("check_in_id", checkInIds);
      if (signalsError) throw signalsError;
      for (const row of (signals ?? []) as (SignalFeatures & { check_in_id: string })[]) {
        signalsByCheckIn.set(row.check_in_id, row);
      }
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
    const points: TrendPoint[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (WINDOW_DAYS - 1 - i));
      const key = dayKey(d);

      let rollingCount = 0;
      const rollingSignals: SignalFeatures[] = [];
      for (let offset = 0; offset < ROLLING_DAYS; offset++) {
        const rollingDay = new Date(d);
        rollingDay.setDate(rollingDay.getDate() - offset);
        const day = dayKey(rollingDay);
        rollingCount += countsByDay.get(day) ?? 0;
        const daySignals = signalsByDay.get(day);
        if (daySignals) rollingSignals.push(...daySignals);
      }

      let score: number;
      if (rollingSignals.length > 0) {
        // Blend voice heuristic with a light frequency nudge so consistency still matters.
        const voice = scoreFromVoiceFeatures(rollingSignals);
        const frequency = scoreForCount(rollingCount);
        score = Math.round(voice * 0.85 + frequency * 0.15);
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

    return { points, source: "live" };
  } catch {
    return { points: mockData.trend.points as TrendPoint[], source: "sample" };
  }
}
