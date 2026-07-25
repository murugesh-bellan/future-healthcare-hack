import type { BiomarkerPoint } from "@/lib/types";
import { smoothPath } from "@/lib/trend";

interface BiomarkerSparklineProps {
  points: BiomarkerPoint[];
}

/** Compact, axis-free trend line for a single biomarker card — values are on their own native scale, not 0-100. */
export function BiomarkerSparkline({ points }: BiomarkerSparklineProps) {
  if (points.length < 2) return null;

  const W = 200;
  const H = 56;
  const pad = 4;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;

  const xFor = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const yFor = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }));
  const linePath = smoothPath(coords);
  const last = coords[coords.length - 1];

  return (
    <svg className="h-14 w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <path d={linePath} fill="none" stroke="#b8dad7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3" fill="#b8dad7" />
    </svg>
  );
}
