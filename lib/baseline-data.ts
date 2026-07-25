// Ports the .vada engine's strength_baseline / strength_longitudinal concepts:
// within-person reference statistics and trend, computed fresh from a
// speaker's full strength_scores history rather than maintained incrementally
// — matching the original's design as pure aggregates over that history.
import type { BaselineDriftDirection } from "@/lib/database-types";

export interface ScoredCheckIn {
  value: number;
  createdAt: string;
}

export interface BaselineComputation {
  mean: number;
  mad: number;
  count: number;
  firstCheckInAt: string;
  lastCheckInAt: string;
}

export interface LongitudinalComputation {
  first: number;
  last: number;
  /** Points per day, (last - first) / days between first and last check-in. */
  slope: number;
  direction: BaselineDriftDirection;
  /** Largest single-step drop between consecutive check-ins (most negative delta); null with fewer than 2 check-ins. */
  maxDrop: number | null;
  changePoint: boolean;
  /** (last - mean) / mad, the most recent check-in's deviation from this speaker's own baseline. */
  latestZScore: number;
}

const DIRECTION_SLOPE_THRESHOLD = 0.3;
const CHANGE_POINT_DROP_THRESHOLD = -20;

function sortedByDate(scores: ScoredCheckIn[]): ScoredCheckIn[] {
  return [...scores].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Personal reference stats: mean and mean absolute deviation (not variance/stddev — mirrors the engine's sqrt-free design). */
export function computeBaseline(scores: ScoredCheckIn[]): BaselineComputation | null {
  if (scores.length === 0) return null;
  const mean = scores.reduce((sum, s) => sum + s.value, 0) / scores.length;
  const mad = scores.reduce((sum, s) => sum + Math.abs(s.value - mean), 0) / scores.length;
  const sorted = sortedByDate(scores);
  return {
    mean,
    mad,
    count: scores.length,
    firstCheckInAt: sorted[0].createdAt,
    lastCheckInAt: sorted[sorted.length - 1].createdAt,
  };
}

/** Within-person trend: slope, direction, largest single-step drop, and a change-point flag. */
export function computeLongitudinal(scores: ScoredCheckIn[], baseline: BaselineComputation): LongitudinalComputation {
  const sorted = sortedByDate(scores);
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;

  const spanDays =
    (new Date(baseline.lastCheckInAt).getTime() - new Date(baseline.firstCheckInAt).getTime()) / (1000 * 60 * 60 * 24);
  const slope = spanDays > 0 ? (last - first) / spanDays : 0;

  const direction: BaselineDriftDirection =
    slope < -DIRECTION_SLOPE_THRESHOLD ? "deteriorating" : slope > DIRECTION_SLOPE_THRESHOLD ? "recovering" : "stable";

  let maxDrop: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i].value - sorted[i - 1].value;
    if (maxDrop === null || delta < maxDrop) maxDrop = delta;
  }
  const changePoint = maxDrop !== null && maxDrop < CHANGE_POINT_DROP_THRESHOLD;

  const latestZScore = baseline.mad > 0 ? (last - baseline.mean) / baseline.mad : 0;

  return { first, last, slope, direction, maxDrop, changePoint, latestZScore };
}
