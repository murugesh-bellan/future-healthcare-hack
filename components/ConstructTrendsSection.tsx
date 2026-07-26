"use client";

import { useState } from "react";
import type { ConstructTrend } from "@/lib/trend-data";

/**
 * Historical, per-construct trend bands (Vocal Stability, Phonation
 * Efficiency, ...) — distinct from TrendsView's "Why This Score" section
 * (a latest-check-in-only decomposition of 3 subsystems) and its raw
 * biomarker sparklines (unfriendly feature names, not these named
 * constructs). Named "Construct history" rather than reusing "Why this
 * score" specifically to avoid two differently-modeled sections with the
 * same title on one page. Collapsed by default, showing only the 1-2
 * measurements actually worth a patient's attention, not all of them at
 * once — consumer-tech apps (Oura's Contributors, Whoop's Recovery factors)
 * surface a short list with a plain-language read, not a technical
 * dashboard grid.
 */
function bandFor(value: number): { label: string; note: string; className: string; needsAttention: boolean } {
  if (value >= 70) {
    return { label: "Steady", note: "holding steady", className: "text-primary", needsAttention: false };
  }
  if (value >= 50) {
    return {
      label: "Worth watching",
      note: "drifted a little over this period",
      className: "text-tertiary",
      needsAttention: true,
    };
  }
  return {
    label: "Worth mentioning",
    note: "lower than usual over this period",
    className: "text-error",
    needsAttention: true,
  };
}

function windowLabel(pointCount: number): string {
  if (pointCount <= 1) return "today's check-in";
  if (pointCount <= 7) return `your last ${pointCount} check-ins`;
  return "your last 14 days";
}

// Every construct from lib/scoring.ts is "higher = better" except fatigue_index,
// which rises as vocal_stability_index/respiratory_support_index fall (higher =
// more fatigued) — see the matching note on CONSTRUCT_DISPLAY_NAMES.fatigue_index
// in lib/physiological-constructs.ts. bandFor()/sorting below need a uniform
// "higher = better" direction, so this flips fatigue_index's score before either.
function goodnessOf(name: string, score: number): number {
  return name === "fatigue_index" ? 100 - score : score;
}

export function ConstructTrendsSection({ constructs }: { constructs: ConstructTrend[] }) {
  const [expanded, setExpanded] = useState(false);
  if (constructs.length === 0) return null;

  const withLatest = constructs
    .map((c) => {
      const latest = c.points[c.points.length - 1]?.score ?? 0;
      return { ...c, latest, goodness: goodnessOf(c.name, latest) };
    })
    .sort((a, b) => a.goodness - b.goodness); // worst-first, so the most relevant ones surface

  const drivers = withLatest.filter((c) => bandFor(c.goodness).needsAttention).slice(0, 2);
  const highlighted = drivers.length > 0 ? drivers : withLatest.slice(0, 1); // nothing to flag -> show the top one anyway
  const rest = withLatest.filter((c) => !highlighted.includes(c));
  const anyPoints = withLatest[0]?.points.length ?? 0;

  return (
    <section className="flex flex-col gap-stack-sm rounded-lg bg-surface-container p-container-margin shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={expanded}
      >
        <div>
          <h2 className="text-body-md font-semibold text-on-surface">Construct history</h2>
          <p className="text-label-sm text-on-surface-variant/70">Based on {windowLabel(anyPoints)}</p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      <div className="flex flex-col gap-2">
        {highlighted.map((c) => {
          const { label, note, className } = bandFor(c.goodness);
          return (
            <div key={c.name} className="flex items-center justify-between gap-3">
              <span className="text-body-md text-on-surface">{c.displayName}</span>
              <span className={`shrink-0 text-label-sm ${className}`}>
                {label} — {note}
              </span>
            </div>
          );
        })}
      </div>

      {expanded && rest.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-outline-variant/20 pt-2">
          {rest.map((c) => {
            const { label, className } = bandFor(c.goodness);
            return (
              <div key={c.name} className="flex items-center justify-between gap-3">
                <span className="text-body-md text-on-surface-variant">{c.displayName}</span>
                <span className={`shrink-0 text-label-sm ${className}`}>{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {!expanded && rest.length > 0 ? (
        <button onClick={() => setExpanded(true)} className="self-start text-label-sm text-primary">
          See all {constructs.length}
        </button>
      ) : null}
    </section>
  );
}
