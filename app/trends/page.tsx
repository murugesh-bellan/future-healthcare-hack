import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { TrendsView } from "@/components/TrendsView";
import { ConstructTrendsSection } from "@/components/ConstructTrendsSection";
import { loadTrend, loadConstructTrends } from "@/lib/trend-data";
import { loadLatestDrift } from "@/lib/score-data";

/**
 * Patient-facing Trends page — deliberately kept to score + Trend Insight +
 * the collapsed construct summary. The raw subsystem decomposition bars,
 * frailty coefficients, and per-feature voice signal sparklines are real
 * data, but they're clinician-grade detail, not something a patient needs
 * to make sense of day to day — that detail lives in /clinician instead,
 * for the same underlying data.
 */
export default async function TrendsPage() {
  const [
    { points, source: trendSource },
    { drift, source: driftSource },
    { constructs, source: constructSource },
  ] = await Promise.all([loadTrend(), loadLatestDrift(), loadConstructTrends()]);
  const sources = [trendSource, driftSource, constructSource];
  const source = sources.every((s) => s === "live") ? "live" : "sample";

  return (
    <>
      <TopBar title="Trends" />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-stack-lg px-container-margin pt-24 pb-32">
        <TrendsView points={points} series={[]} decomposition={null} drift={drift} frailty={null} source={source} />
        <ConstructTrendsSection constructs={constructs} />
      </main>
      <BottomNav />
    </>
  );
}
