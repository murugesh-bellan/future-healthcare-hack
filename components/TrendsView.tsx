"use client";

import { useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { BiomarkerSparkline } from "@/components/BiomarkerSparkline";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import type { BiomarkerSeries, DataSource, TrendPoint } from "@/lib/types";
import { percentChange, pointsInWindow, WINDOW_LABELS, type TrendWindow } from "@/lib/trend";

const RANGES: { label: string; window: TrendWindow }[] = [
  { label: "Week", window: 7 },
  { label: "Month", window: 30 },
  { label: "All time", window: 90 },
];

function formatValue(value: number, unit: string): string {
  const decimals = unit === "Hz" || unit === "wpm" || unit === "s" ? 0 : unit === "ratio" ? 2 : 1;
  return value.toFixed(decimals);
}

export function TrendsView({
  points,
  series,
  source,
}: {
  points: TrendPoint[];
  series: BiomarkerSeries[];
  source: DataSource;
}) {
  const [window, setWindow] = useState<TrendWindow>(30);

  const visible = pointsInWindow(points, window);
  const latest = visible[visible.length - 1]?.score ?? 0;
  const delta = percentChange(visible);
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}% ${WINDOW_LABELS[window]}`;
  const scores = visible.map((p) => p.score);
  const checkInsLogged = visible.reduce((sum, p) => sum + p.checkInCount, 0);
  const trendingUp = delta >= 0;

  return (
    <>
      <div className="flex w-full justify-center">
        <div className="flex items-center rounded-full bg-surface-container-low p-1 shadow-inner">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setWindow(r.window)}
              aria-pressed={r.window === window}
              className={
                r.window === window
                  ? "rounded-full bg-primary-container px-6 py-2 text-label-md text-on-primary-container shadow-sm transition-all"
                  : "rounded-full px-6 py-2 text-label-md text-on-surface-variant transition-all hover:text-on-surface"
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-lg bg-surface-container p-container-margin shadow-lg">
        <div className="mb-6 flex flex-col gap-1">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-widest">Strength Score</span>
          <div className="flex items-baseline gap-2">
            <span className="text-headline-xl text-primary">{latest}</span>
            <span className="text-label-md text-on-surface-variant">/100</span>
            <span className="ml-1 text-label-md text-primary/70">{deltaLabel}</span>
          </div>
        </div>
        <TrendChart points={visible} />
      </section>

      <div className="grid grid-cols-2 gap-gutter">
        <div className="flex flex-col gap-2 rounded-lg bg-surface-container p-5">
          <span className="text-label-sm text-on-surface-variant">Check-ins logged</span>
          <span className="text-headline-md text-on-surface">{checkInsLogged}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-surface-container p-5">
          <span className="text-label-sm text-on-surface-variant">Range this period</span>
          <span className="text-headline-md text-on-surface">
            {Math.min(...scores)}–{Math.max(...scores)}
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-tertiary-container/20 bg-tertiary-container/10 p-container-margin shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex shrink-0 items-center justify-center rounded-full bg-tertiary-container p-2">
            <span className="material-symbols-outlined text-on-tertiary-container">info</span>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-headline-md text-tertiary">Trend Insight</h3>
            <p className="leading-relaxed text-body-md text-on-tertiary-container opacity-90">
              {trendingUp
                ? "Your check-in consistency has picked up recently — nice momentum."
                : "Your check-ins have slowed a bit lately — might be worth mentioning next time you talk to your care team."}
            </p>
          </div>
        </div>
      </section>

      {series.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="text-headline-md text-on-surface">Voice Signals</h3>
          <div className="grid grid-cols-2 gap-gutter">
            {series.map((s) => (
              <div key={s.featureName} className="flex flex-col gap-2 rounded-lg bg-surface-container p-5">
                <span className="text-label-sm text-on-surface-variant">{s.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-headline-md text-on-surface">
                    {s.latestValue !== null ? formatValue(s.latestValue, s.unit) : "—"}
                  </span>
                  {s.unit && <span className="text-label-sm text-on-surface-variant">{s.unit}</span>}
                </div>
                <BiomarkerSparkline points={s.points} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col items-center gap-3">
        <DataSourceBadge source={source} />
        <p className="px-4 text-center text-label-sm text-on-surface-variant/70">Wellness tracking, not a medical diagnosis.</p>
      </div>
    </>
  );
}
