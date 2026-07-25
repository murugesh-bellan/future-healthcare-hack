import { supabaseServer } from "@/lib/supabase-server";
import type { CheckInRow } from "@/lib/database-types";
import type { DataSource, TrendPoint } from "@/lib/types";
import mockData from "@/lib/mock-data.json";

const WINDOW_DAYS = 90;
const ROLLING_DAYS = 7;

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
      return { date: dayKey(d), score: scoreForCount(rollingCount) };
    });

    return { points, source: "live" };
  } catch {
    return { points: mockData.trend.points as TrendPoint[], source: "sample" };
  }
}
