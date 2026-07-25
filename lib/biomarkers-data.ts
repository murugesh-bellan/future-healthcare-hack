import { supabaseServer } from "@/lib/supabase-server";
import type { AcousticBiomarkerRow, CheckInRow } from "@/lib/database-types";
import type { BiomarkerPoint, BiomarkerSeries, DataSource } from "@/lib/types";
import mockData from "@/lib/mock-data.json";

const LOOKBACK_DAYS = 30;
const MAX_POINTS_PER_FEATURE = 20;

const FEATURE_LABELS: Record<string, string> = {
  F0: "Pitch (F0)",
  F0_std: "Pitch Stability",
  Jitter: "Jitter",
  Shimmer: "Shimmer",
  Loudness: "Loudness",
  PauseRatio: "Pause Ratio",
  SpeechRate: "Speech Rate",
  RecordingDuration: "Recording Duration",
  VoicedSegmentDuration: "Voiced Duration",
};

/** Display order — most clinically legible signals first. */
const FEATURE_ORDER = [
  "Jitter",
  "Shimmer",
  "F0",
  "F0_std",
  "PauseRatio",
  "SpeechRate",
  "Loudness",
  "RecordingDuration",
  "VoicedSegmentDuration",
];

/** Pure: derives each acoustic biomarker feature's recent time series from already-fetched check-ins and biomarker rows. */
export function deriveBiomarkerSeries(
  checkIns: Pick<CheckInRow, "id" | "created_at">[],
  biomarkers: Pick<AcousticBiomarkerRow, "check_in_id" | "feature_name" | "raw_value" | "units">[],
): BiomarkerSeries[] {
  const checkInById = new Map(checkIns.map((r) => [r.id, r]));

  // Postgres does not guarantee row order for `.in(...)`, so each point carries
  // its check-in's created_at for sorting below rather than relying on query order.
  const byFeature = new Map<string, { unit: string | null; points: (BiomarkerPoint & { createdAt: string })[] }>();
  for (const row of biomarkers) {
    if (row.raw_value === null) continue;
    const checkIn = checkInById.get(row.check_in_id);
    if (!checkIn) continue;
    const entry = byFeature.get(row.feature_name) ?? { unit: row.units, points: [] };
    entry.points.push({ date: checkIn.created_at.slice(0, 10), value: row.raw_value, createdAt: checkIn.created_at });
    byFeature.set(row.feature_name, entry);
  }

  return FEATURE_ORDER.filter((name) => byFeature.has(name)).map((name) => {
    const entry = byFeature.get(name)!;
    const sorted = [...entry.points].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const points = sorted.slice(-MAX_POINTS_PER_FEATURE).map(({ date, value }) => ({ date, value }));
    return {
      featureName: name,
      label: FEATURE_LABELS[name] ?? name,
      unit: entry.unit ?? "",
      latestValue: points.length > 0 ? points[points.length - 1].value : null,
      points,
    };
  });
}

/**
 * Loads each acoustic biomarker feature's recent time series for the signed-in
 * patient, oldest first, for the "Voice Signals" dashboard on Trends. Falls
 * back to bundled sample data (reported in `source`) whenever there's no
 * session, no patient row yet, no recordings in range, or the query fails.
 */
export async function loadBiomarkers(): Promise<{ series: BiomarkerSeries[]; source: DataSource }> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const { data: patient } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!patient) throw new Error("No patient record yet.");

    const fetchStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const { data: checkIns, error: checkInsError } = await supabase
      .from("check_ins")
      .select("id, created_at")
      .eq("patient_id", patient.id)
      .gte("created_at", fetchStart.toISOString())
      .order("created_at");
    if (checkInsError) throw checkInsError;

    const rows = (checkIns ?? []) as Pick<CheckInRow, "id" | "created_at">[];
    if (rows.length === 0) throw new Error("No recordings in range.");

    const { data: biomarkers, error: biomarkersError } = await supabase
      .from("acoustic_biomarkers")
      .select("check_in_id, feature_name, raw_value, units")
      .in("check_in_id", rows.map((r) => r.id));
    if (biomarkersError) throw biomarkersError;

    const series = deriveBiomarkerSeries(
      rows,
      (biomarkers ?? []) as Pick<AcousticBiomarkerRow, "check_in_id" | "feature_name" | "raw_value" | "units">[],
    );
    if (series.length === 0) throw new Error("No biomarker rows yet.");

    return { series, source: "live" };
  } catch {
    return { series: mockData.biomarkers as BiomarkerSeries[], source: "sample" };
  }
}
