import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { TrendsView } from "@/components/TrendsView";
import { loadTrend } from "@/lib/trend-data";
import { loadBiomarkers } from "@/lib/biomarkers-data";
import { loadLatestDecomposition, loadLatestDrift, loadLatestFrailty } from "@/lib/score-data";

export default async function TrendsPage() {
  const [
    { points, source: trendSource },
    { series, source: biomarkerSource },
    { decomposition, source: decompositionSource },
    { drift, source: driftSource },
    { frailty, source: frailtySource },
  ] = await Promise.all([
    loadTrend(),
    loadBiomarkers(),
    loadLatestDecomposition(),
    loadLatestDrift(),
    loadLatestFrailty(),
  ]);
  const sources = [trendSource, biomarkerSource, decompositionSource, driftSource, frailtySource];
  const source = sources.every((s) => s === "live") ? "live" : "sample";

  return (
    <>
      <TopBar title="Trends" />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-stack-lg px-container-margin pt-24 pb-32">
        <TrendsView
          points={points}
          series={series}
          decomposition={decomposition}
          drift={drift}
          frailty={frailty}
          source={source}
        />
      </main>
      <BottomNav />
    </>
  );
}
