import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { TrendsView } from "@/components/TrendsView";
import { loadTrendsPageData } from "@/lib/dashboard-data";

export default async function TrendsPage() {
  const { points, series, source } = await loadTrendsPageData();

  return (
    <>
      <TopBar title="Trends" />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-stack-lg px-container-margin pt-24 pb-32">
        <TrendsView points={points} series={series} source={source} />
      </main>
      <BottomNav />
    </>
  );
}
