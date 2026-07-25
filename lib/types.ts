import type { BaselineDriftDirection, FrailtyAxis } from "@/lib/database-types";

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

/** score_decompositions summary for the Trends "Why This Score" section. */
export interface DecompositionSummary {
  scoreValue: number;
  confidence: number | null;
  rows: { subsystem: string; contribution: number; weight: number }[];
}

/** Latest baseline_drifts row for the Trends "Trend Insight" card. */
export interface DriftSummary {
  direction: BaselineDriftDirection;
  changePointDetected: boolean;
  trendSlope: number | null;
  zScore: number | null;
}

/** subsystem name -> dashboard label, for the "Why This Score" breakdown. */
export const SUBSYSTEM_LABELS: Record<string, string> = {
  functional_capacity: "Functional Capacity",
  fatigue_index: "Fatigue",
  phonation_efficiency: "Phonation Efficiency",
};

/** Cited coefficient × measured feature only — not a complete model log-odds (no intercept/other covariates available), so no probability is derived from it. */
export interface FrailtyAxisSummary {
  axis: FrailtyAxis;
  coefficientContribution: number;
  confidence: number;
}

export interface FrailtyCitation {
  source: string;
  finding: string;
  /** Null when no DOI/link is on record yet. */
  url: string | null;
}

/** Latest frailty_assessments rows for the Trends "Frailty Risk Indicators" section. */
export interface FrailtySummary {
  axes: FrailtyAxisSummary[];
  citation: FrailtyCitation | null;
}

/** frailty axis -> dashboard label. */
export const FRAILTY_AXIS_LABELS: Record<FrailtyAxis, string> = {
  energy_based_frailty: "Energy-Based Frailty (A1)",
  sarcopenia_based_frailty: "Sarcopenia-Based Frailty (A2)",
};
