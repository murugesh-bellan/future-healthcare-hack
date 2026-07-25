import { supabaseServer } from "@/lib/supabase-server";
import type { AcousticBiomarkerRow, CheckInRow } from "@/lib/database-types";
import type { BiomarkerSeries, DataSource, TrendPoint } from "@/lib/types";
import mockData from "@/lib/mock-data.json";
import { deriveTrendPoints } from "@/lib/trend-data";
import { deriveBiomarkerSeries } from "@/lib/biomarkers-data";

const TREND_WINDOW_DAYS = 90;
const TREND_ROLLING_DAYS = 7;
const BIOMARKER_LOOKBACK_DAYS = 30;
// Widest of the two windows above — one check-ins fetch covers both.
const FETCH_DAYS = TREND_WINDOW_DAYS + TREND_ROLLING_DAYS;

/**
 * Combined loader for the /trends page. `loadTrend` and `loadBiomarkers`
 * (lib/trend-data.ts, lib/biomarkers-data.ts) each independently resolve
 * auth → patient → check_ins → acoustic_biomarkers — when called together via
 * Promise.all (as /trends did), that's two full, redundant round-trip chains
 * to Supabase on every page load. This does that resolution once and derives
 * both results from the same fetched data, using the same pure derive
 * functions those modules export (so the actual trend/biomarker logic isn't
 * duplicated, just the fetching).
 *
 * Trend and biomarker `source` can still differ (e.g. real trend data before
 * any biomarker rows exist), matching the page's existing
 * `trendSource === "live" && biomarkerSource === "live"` combine logic.
 */
export async function loadTrendsPageData(): Promise<{
  points: TrendPoint[];
  series: BiomarkerSeries[];
  source: DataSource;
}> {
  let points: TrendPoint[];
  let trendSource: DataSource;
  let series: BiomarkerSeries[];
  let biomarkerSource: DataSource;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!patient) throw new Error("No patient record yet.");

    const fetchStart = new Date(Date.now() - FETCH_DAYS * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from("check_ins")
      .select("id, created_at")
      .eq("patient_id", patient.id)
      .gte("created_at", fetchStart.toISOString())
      .order("created_at");
    if (error) throw error;

    const checkIns = (data ?? []) as Pick<CheckInRow, "id" | "created_at">[];

    let biomarkers: Pick<AcousticBiomarkerRow, "check_in_id" | "feature_name" | "raw_value" | "units">[] = [];
    if (checkIns.length > 0) {
      const { data: biomarkerRows, error: biomarkersError } = await supabase
        .from("acoustic_biomarkers")
        .select("check_in_id, feature_name, raw_value, units")
        .in(
          "check_in_id",
          checkIns.map((c) => c.id),
        );
      if (biomarkersError) throw biomarkersError;
      biomarkers = (biomarkerRows ?? []) as Pick<
        AcousticBiomarkerRow,
        "check_in_id" | "feature_name" | "raw_value" | "units"
      >[];
    }

    points = deriveTrendPoints(checkIns, biomarkers, TREND_WINDOW_DAYS, TREND_ROLLING_DAYS);
    trendSource = "live";

    // Biomarker series has its own, narrower fallback semantics — real trend
    // data can exist before any biomarker rows do.
    try {
      const biomarkerCutoff = new Date(Date.now() - BIOMARKER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const recentCheckIns = checkIns.filter((c) => c.created_at >= biomarkerCutoff);
      if (recentCheckIns.length === 0) throw new Error("No recordings in range.");

      const derived = deriveBiomarkerSeries(recentCheckIns, biomarkers);
      if (derived.length === 0) throw new Error("No biomarker rows yet.");
      series = derived;
      biomarkerSource = "live";
    } catch {
      series = mockData.biomarkers as BiomarkerSeries[];
      biomarkerSource = "sample";
    }
  } catch {
    points = mockData.trend.points as TrendPoint[];
    trendSource = "sample";
    series = mockData.biomarkers as BiomarkerSeries[];
    biomarkerSource = "sample";
  }

  const source: DataSource = trendSource === "live" && biomarkerSource === "live" ? "live" : "sample";
  return { points, series, source };
}
