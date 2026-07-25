export interface TrendPoint {
  date: string; // ISO 8601 date, no time
  score: number; // 0-100 — illustrative Strength Score, not a validated biometric
  /** Check-ins logged on this calendar day (for Trends "Check-ins logged"). */
  checkInCount: number;
}

export type DataSource = "live" | "sample";

export interface BiomarkerPoint {
  date: string; // ISO 8601 date, no time
  value: number;
}

/** One acoustic_biomarkers feature's recent time series, for the Trends "Voice Signals" dashboard. */
export interface BiomarkerSeries {
  featureName: string;
  label: string; // display name, e.g. "Pitch Stability"
  unit: string;
  latestValue: number | null;
  points: BiomarkerPoint[];
}

export interface Citation {
  id: string;
  metricLabel: string; // e.g. "Muscle-Integrity Index"
  claim: string; // one-sentence plain-language claim
  source: string; // paper title
  venue: string; // journal/venue
  year: number;
  sampleSize: number | null;
}
