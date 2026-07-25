export interface TrendPoint {
  date: string; // ISO 8601 date, no time
  score: number; // 0-100
}

export type DataSource = "live" | "sample";

export interface Citation {
  id: string;
  metricLabel: string; // e.g. "Muscle-Integrity Index"
  claim: string; // one-sentence plain-language claim
  source: string; // paper title
  venue: string; // journal/venue
  year: number;
  sampleSize: number | null;
}
