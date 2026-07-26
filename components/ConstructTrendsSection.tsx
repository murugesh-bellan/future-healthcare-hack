"use client";

import { useState } from "react";
import type { ConstructTrend } from "@/lib/trend-data";

/**
 * "Why this score" — collapsed by default, shows only the 1-2 measurements
 * actually worth a patient's attention, not all six at once. Consumer-tech
 * apps (Oura's Contributors, Whoop's Recovery factors) surface a short list
 * with a plain-language read, not a technical dashboard grid — this mirrors
 * that instead of the earlier six-card layout.
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

export function ConstructTrendsSection({ constructs }: { constructs: ConstructTrend[] }) {
  const [expanded, setExpanded] = useState(false);
  if (constructs.length === 0) return null;

  const withLatest = constructs
    .map((c) => ({ ...c, latest: c.points[c.points.length - 1]?.score ?? 0 }))
    .sort((a, b) => a.latest - b.latest); // worst-first, so the most relevant ones surface

  const drivers = withLatest.filter((c) => bandFor(c.latest).needsAttention).slice(0, 2);
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
          <h2 className="text-body-md font-semibold text-on-surface">Why this score</h2>
          <p className="text-label-sm text-on-surface-variant/70">Based on {windowLabel(anyPoints)}</p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      <div className="flex flex-col gap-2">
        {highlighted.map((c) => {
          const { label, note, className } = bandFor(c.latest);
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
            const { label, className } = bandFor(c.latest);
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
