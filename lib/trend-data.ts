import { supabaseServer } from "@/lib/supabase-server";
import type { CheckInRow, PhysiologicalConstructRow } from "@/lib/database-types";
import type { DataSource, TrendPoint } from "@/lib/types";
import { CONSTRUCT_DISPLAY_NAMES } from "@/lib/physiological-constructs";
import mockData from "@/lib/mock-data.json";

const WINDOW_DAYS = 90;
const ROLLING_DAYS = 7;

export interface ConstructTrend {
  name: string;
  displayName: string;
  points: TrendPoint[];
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Illustrative strength score derived from trailing-week check-in frequency — not a validated biometric. */
function scoreForCount(count: number): number {
  return Math.max(0, Math.min(100, 50 + count * 6));
}

/**
 * Loads the signed-in patient's daily trend for the last 90 days.
 * Falls back to bundled sample data (and reports that in `source`) whenever
 * there's no session, no patient row yet, or the query fails — so the UI
 * never has to handle a hard error mid-demo.
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
      .select("created_at")
      .eq("patient_id", patient.id)
      .gte("created_at", fetchStart.toISOString())
      .order("created_at");
    if (error) throw error;

    const checkIns = (data ?? []) as Pick<CheckInRow, "created_at">[];
    const countsByDay = new Map<string, number>();
    for (const row of checkIns) {
      const key = row.created_at.slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const today = new Date();
    const points: TrendPoint[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (WINDOW_DAYS - 1 - i));
      let rollingCount = 0;
      for (let offset = 0; offset < ROLLING_DAYS; offset++) {
        const rollingDay = new Date(d);
        rollingDay.setDate(rollingDay.getDate() - offset);
        rollingCount += countsByDay.get(dayKey(rollingDay)) ?? 0;
      }
      return { date: dayKey(d), score: scoreForCount(rollingCount), checkInCount: countsByDay.get(dayKey(d)) ?? 0 };
    });

    return { points, source: "live" };
  } catch {
    return { points: mockData.trend.points as TrendPoint[], source: "sample" };
  }
}

/**
 * Loads the signed-in patient's physiological-construct history (Vocal
 * Stability, Phonation Efficiency, ...) for the friendly-framing trend cards.
 * These are the same six named constructs computed in the Prometheux
 * reasoning engine — same features, same names — just running live here
 * since Prometheux has no request-time API this app can call.
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

/** Bundled sample data — same shape a real signal-quality-limited or fresh account would eventually populate. */
const SAMPLE_CONSTRUCT_TRENDS: ConstructTrend[] = Object.entries(CONSTRUCT_DISPLAY_NAMES).map(([name, displayName], i) => ({
  name,
  displayName,
  points: mockData.trend.points.slice(-14).map((p, day) => ({
    date: p.date,
    score: Math.max(30, Math.min(95, 62 + Math.round(Math.sin(day / 3 + i) * 12))),
    checkInCount: 0,
  })),
}));
