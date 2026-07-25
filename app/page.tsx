import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { TrendChart } from "@/components/TrendChart";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { loadTrend } from "@/lib/trend-data";
import { percentChange, pointsInWindow } from "@/lib/trend";

const RING_CIRCUMFERENCE = 283;

export default async function HomePage() {
  const { points, source } = await loadTrend();
  const week = pointsInWindow(points, 7);
  const currentScore = week[week.length - 1]?.score ?? 0;
  const delta = percentChange(week);
  const ringOffset = Math.round(RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * currentScore) / 100);

  const summary =
    delta > 2
      ? "Your strength is trending up this week — nice work."
      : delta < -2
        ? "Your strength has dipped a little this week."
        : "Your strength has been steady this week — nice work.";

  return (
    <>
      <TopBar title="Undertone" />
      <main className="mx-auto flex max-w-2xl flex-col items-center px-container-margin pt-24 safe-bottom-padding">
        <section className="relative flex w-full flex-col items-center overflow-hidden py-stack-lg">
          <div className="pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[80px]" />
          <div className="relative flex h-64 w-64 items-center justify-center md:h-80 md:w-80">
            <svg
              className="h-full w-full -rotate-90"
              viewBox="0 0 100 100"
              role="img"
              aria-label={`Strength score ${currentScore} out of 100`}
            >
              <circle className="text-surface-container" cx="50" cy="50" fill="transparent" r="45" stroke="currentColor" strokeWidth="12" />
              <circle
                cx="50"
                cy="50"
                fill="transparent"
                r="45"
                stroke="url(#sage-teal-gradient)"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                strokeWidth="12"
              />
              <defs>
                <linearGradient id="sage-teal-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#b8dad7" />
                  <stop offset="100%" stopColor="#9dbebb" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-headline-xl text-primary">{currentScore}</span>
              <span className="text-label-md text-on-surface-variant opacity-70">Strength Score</span>
            </div>
          </div>
          <p className="mt-stack-lg max-w-xs px-4 text-center text-body-lg text-on-surface">{summary}</p>
          <div className="mt-stack-sm">
            <DataSourceBadge source={source} />
          </div>
        </section>

        <Link href="/trends" className="mt-stack-md block w-full transition-transform active:scale-[0.99]">
          <div className="rounded-lg border border-white/5 bg-surface-container/40 p-stack-md">
            <div className="mb-stack-sm flex items-center justify-between">
              <span className="text-label-md text-on-surface-variant uppercase tracking-wider">7-Day Trend</span>
              <span className="flex items-center gap-1 text-label-sm text-primary">
                <span className="material-symbols-outlined text-[14px]">{delta >= 0 ? "trending_up" : "trending_down"}</span>
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
            </div>
            <TrendChart points={week} compact />
            <div className="mt-2 flex justify-between px-1 text-[10px] tracking-widest text-on-surface-variant uppercase">
              {week.map((p) => (
                <span key={p.date}>
                  {new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                </span>
              ))}
            </div>
          </div>
        </Link>

        <section className="mt-stack-lg w-full">
          <div className="flex flex-col items-center rounded-lg border border-white/5 bg-surface-container/40 p-stack-lg text-center backdrop-blur-xl">
            <h3 className="mb-stack-md text-headline-md text-on-surface">How are you feeling today?</h3>
            <Link
              href="/check-in"
              className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-primary-container shadow-lg shadow-primary/20 transition-transform duration-300 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined text-[32px] text-on-primary-container">mic</span>
            </Link>
            <p className="mt-stack-md text-label-md text-on-surface-variant">Tap to talk</p>
          </div>
        </section>

        <footer className="mt-section-gap mb-stack-lg flex flex-col items-center gap-stack-sm">
          <div className="flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-4 py-2">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">info</span>
            <span className="text-label-sm text-on-surface-variant">Wellness tracking, not a medical diagnosis.</span>
          </div>
          <Link href="/how-it-works" className="text-label-sm text-primary">
            How it works
          </Link>
        </footer>
      </main>
      <BottomNav />
    </>
  );
}
