import type { TrendPoint } from "@/lib/types";
import { formatShortDate, smoothPath } from "@/lib/trend";

interface TrendChartProps {
  points: TrendPoint[];
  /** Dashed reference line — always server-sourced, never hardcoded. */
  threshold?: number;
  /** Compact variant for the home sparkline: no axes, no labels. */
  compact?: boolean;
}

/**
 * Padded domain rounded to tens, always wide enough to include the threshold.
 * The axis is deliberately labelled: a non-zero baseline is only misleading
 * when the scale is hidden, and a fixed 0-100 domain flattens the real
 * week-to-week movement this product exists to surface.
 */
function yDomain(scores: number[], threshold?: number): [number, number] {
  const lo = Math.min(...scores, threshold ?? Infinity);
  const hi = Math.max(...scores, threshold ?? -Infinity);
  const min = Math.max(0, Math.floor((lo - 6) / 10) * 10);
  const max = Math.min(100, Math.ceil((hi + 6) / 10) * 10);
  return [min, max === min ? min + 10 : max];
}

function ticksFor(min: number, max: number): number[] {
  const span = max - min;
  const step = span <= 20 ? 5 : span <= 50 ? 10 : 20;
  const out: number[] = [];
  for (let t = min; t <= max; t += step) out.push(t);
  return out;
}

export function TrendChart({ points, threshold, compact = false }: TrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="w-full py-12 text-center font-label-md text-label-md text-on-surface-variant">
        No check-ins yet — your trend appears here after your first one.
      </div>
    );
  }

  const W = 400;
  const H = compact ? 96 : 210;
  const padLeft = compact ? 2 : 34;
  const padRight = compact ? 2 : 10;
  const padTop = compact ? 8 : 12;
  const padBottom = compact ? 8 : 28;

  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const [yMin, yMax] = yDomain(
    points.map((p) => p.score),
    compact ? undefined : threshold,
  );
  const yTicks = ticksFor(yMin, yMax);

  const xFor = (i: number) =>
    padLeft + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yFor = (score: number) =>
    padTop + plotH - ((score - yMin) / (yMax - yMin)) * plotH;

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.score) }));
  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(2)},${padTop + plotH} L${coords[0].x.toFixed(2)},${padTop + plotH} Z`;

  const last = coords[coords.length - 1];
  const gradId = compact ? "trend-area-compact" : "trend-area-full";

  return (
    <div className="w-full">
      <svg
        className="w-full h-auto"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Strength score trend, ${points.length} days, currently ${points[points.length - 1].score} out of 100`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b8dad7" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#b8dad7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {!compact &&
          yTicks.map((t) => (
            <g key={t}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke="#414847"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={yFor(t) + 4}
                textAnchor="end"
                fill="#c1c8c6"
                fontSize="11"
                opacity="0.75"
              >
                {t}
              </text>
            </g>
          ))}

        {!compact && threshold !== undefined && (
          <g>
            <line
              x1={padLeft}
              x2={W - padRight}
              y1={yFor(threshold)}
              y2={yFor(threshold)}
              stroke="#dbad9f"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              opacity="0.85"
            />
            <text
              x={W - padRight}
              y={yFor(threshold) + 12}
              textAnchor="end"
              fill="#dbad9f"
              fontSize="9"
              letterSpacing="0.04em"
              opacity="0.9"
            >
              CHECK-IN THRESHOLD
            </text>
          </g>
        )}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="#b8dad7"
          strokeWidth={compact ? 3 : 3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r={compact ? 3 : 4.5} fill="#b8dad7" />

        {!compact && (
          <>
            <text x={padLeft} y={H - 8} fill="#c1c8c6" fontSize="11" opacity="0.75">
              {formatShortDate(points[0].date)}
            </text>
            <text
              x={padLeft + plotW / 2}
              y={H - 8}
              textAnchor="middle"
              fill="#c1c8c6"
              fontSize="11"
              opacity="0.75"
            >
              {formatShortDate(points[Math.floor(points.length / 2)].date)}
            </text>
            <text
              x={W - padRight}
              y={H - 8}
              textAnchor="end"
              fill="#c1c8c6"
              fontSize="11"
              opacity="0.75"
            >
              Today
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
