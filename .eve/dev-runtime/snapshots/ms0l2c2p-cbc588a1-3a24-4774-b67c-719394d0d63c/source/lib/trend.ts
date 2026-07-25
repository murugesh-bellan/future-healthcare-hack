import type { TrendPoint } from "./types";

export type TrendWindow = 7 | 30 | 90;

/** Suffix for the delta readout, e.g. "+4% vs last week". */
export const WINDOW_LABELS: Record<TrendWindow, string> = {
  7: "vs last week",
  30: "vs last month",
  90: "over 90 days",
};

/** Most recent `windowDays` points, oldest first. */
export function pointsInWindow(points: TrendPoint[], windowDays: TrendWindow): TrendPoint[] {
  return points.slice(-windowDays);
}

/**
 * Percentage change from the first point of the window to the latest.
 * Returns 0 rather than Infinity when the baseline is 0.
 */
export function percentChange(points: TrendPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].score;
  const last = points[points.length - 1].score;
  if (first === 0) return 0;
  return Math.round(((last - first) / first) * 100);
}

/** Build a smooth cubic-bezier path (Catmull-Rom style) through the given points. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/** "2026-07-25" -> "25 Jul" */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
