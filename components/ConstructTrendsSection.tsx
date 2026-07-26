import { TrendChart } from "@/components/TrendChart";
import type { ConstructTrend } from "@/lib/trend-data";

/**
 * Friendly-language framing on top of the same 0-100 construct values the
 * Prometheux reasoning engine computes (Vocal Stability, Phonation
 * Efficiency, Respiratory Support, Motor Coordination, Resonance Stability,
 * Fatigue) — a plain-language band and one-line note instead of a bare
 * number, so a non-technical patient can read this without translation.
 */
function bandFor(value: number): { label: string; note: string; className: string } {
  if (value >= 70) {
    return {
      label: "Steady",
      note: "This has been holding steady — nothing to act on.",
      className: "text-primary",
    };
  }
  if (value >= 50) {
    return {
      label: "Worth watching",
      note: "This has drifted a little — keep an eye on it over the next few check-ins.",
      className: "text-tertiary",
    };
  }
  return {
    label: "Worth mentioning",
    note: "This is lower than usual — worth mentioning next time you talk to your care team.",
    className: "text-error",
  };
}

export function ConstructTrendsSection({ constructs }: { constructs: ConstructTrend[] }) {
  if (constructs.length === 0) return null;

  return (
    <section className="flex flex-col gap-stack-md">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-md text-on-surface">What we&apos;re hearing</h2>
        <p className="text-label-sm text-on-surface-variant/80">
          The same measurements behind your Strength Score, broken down by what each one tracks — not a medical
          reading.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2">
        {constructs.map((c) => {
          const latest = c.points[c.points.length - 1]?.score ?? 0;
          const { label, note, className } = bandFor(latest);
          return (
            <div key={c.name} className="flex flex-col gap-2 rounded-lg bg-surface-container p-container-margin shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-body-md font-semibold text-on-surface">{c.displayName}</span>
                <span className={`text-label-sm font-semibold ${className}`}>{label}</span>
              </div>
              <TrendChart points={c.points} compact />
              <p className="text-label-sm text-on-surface-variant/80">{note}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
