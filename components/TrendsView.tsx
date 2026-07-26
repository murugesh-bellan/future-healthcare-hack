"use client";

import { useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { BiomarkerSparkline } from "@/components/BiomarkerSparkline";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import {
  FRAILTY_AXIS_LABELS,
  SUBSYSTEM_LABELS,
  type BiomarkerSeries,
  type DataSource,
  type DecompositionSummary,
  type DriftSummary,
  type FrailtySummary,
  type TrendPoint,
} from "@/lib/types";
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

/** Plain-language read of the within-person trend, from baseline_drifts. */
function driftInsight(drift: DriftSummary): string {
  const base =
    drift.direction === "deteriorating"
      ? "Your Strength Score has been trending down recently — might be worth mentioning next time you talk to your care team."
      : drift.direction === "recovering"
        ? "Your Strength Score has been trending up recently — nice momentum."
        : "Your Strength Score has been steady recently.";
  return drift.changePointDetected ? `${base} One check-in also showed a notably larger drop than usual.` : base;
}

export function TrendsView({
  points,
  series,
  decomposition,
  drift,
  frailty,
  source,
}: {
  points: TrendPoint[];
  series: BiomarkerSeries[];
  decomposition: DecompositionSummary | null;
  drift: DriftSummary | null;
  frailty: FrailtySummary | null;
  source: DataSource;
}) {
  const [window, setWindow] = useState<TrendWindow>(30);

  const visible = pointsInWindow(points, window);
  const latest = visible[visible.length - 1]?.score ?? 0;
  const delta = percentChange(visible);
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}% ${WINDOW_LABELS[window]}`;
  const scores = visible.map((p) => p.score);
  const checkInsLogged = visible.reduce((sum, p) => sum + p.checkInCount, 0);

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

      {drift && (
        <section className="rounded-lg border border-tertiary-container/20 bg-tertiary-container/10 p-container-margin shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex shrink-0 items-center justify-center rounded-full bg-tertiary-container p-2">
              <span className="material-symbols-outlined text-on-tertiary-container">info</span>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-headline-md text-tertiary">Trend Insight</h3>
              <p className="leading-relaxed text-body-md text-on-tertiary-container opacity-90">{driftInsight(drift)}</p>
            </div>
          </div>
        </section>
      )}

      {decomposition && decomposition.rows.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="text-headline-md text-on-surface">Why This Score</h3>
          <div className="flex flex-col gap-4 rounded-lg bg-surface-container p-container-margin shadow-lg">
            {decomposition.rows.map((row) => {
              const positive = row.contribution >= 0;
              const widthPct = Math.min(100, Math.abs(row.contribution) * 2.5);
              return (
                <div key={row.subsystem} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-label-sm text-on-surface-variant">
                    <span>{SUBSYSTEM_LABELS[row.subsystem] ?? row.subsystem}</span>
                    <span className={positive ? "text-primary" : "text-tertiary"}>
                      {positive ? "+" : ""}
                      {row.contribution.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-low">
                    <div
                      className={positive ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-tertiary"}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {frailty && frailty.axes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="text-headline-md text-on-surface">Frailty Risk Indicators</h3>
          <p className="text-label-sm text-on-surface-variant">
            Voice-derived signals, not a diagnosis. Each value is one published coefficient's own weighted
            contribution — not a complete model log-odds or a calibrated probability (the original study&apos;s
            intercept and other covariates aren&apos;t available here).
          </p>
          <div className="grid grid-cols-2 gap-gutter">
            {frailty.axes.map((axis) => (
              <div key={axis.axis} className="flex flex-col gap-2 rounded-lg bg-surface-container p-5">
                <span className="text-label-sm text-on-surface-variant">{FRAILTY_AXIS_LABELS[axis.axis]}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-headline-md text-on-surface">
                    {axis.coefficientContribution >= 0 ? "+" : ""}
                    {axis.coefficientContribution.toFixed(2)}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">coefficient signal</span>
                </div>
                <span className="text-label-sm text-on-surface-variant/70">
                  {Math.round(axis.confidence * 100)}% confidence
                </span>
              </div>
            ))}
          </div>
          {frailty.citation && (
            <div className="rounded-lg bg-surface-container-low p-4 text-label-sm text-on-surface-variant">
              <p className="italic">&quot;{frailty.citation.finding}&quot;</p>
              <p className="mt-1">
                Source: {frailty.citation.source}
                {frailty.citation.url ? ` — ${frailty.citation.url}` : ""}
              </p>
            </div>
          )}
        </section>
      )}

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
