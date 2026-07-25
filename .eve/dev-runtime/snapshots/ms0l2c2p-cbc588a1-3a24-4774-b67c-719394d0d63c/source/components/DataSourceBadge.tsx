import type { DataSource } from "@/lib/types";

/**
 * Labels sample data as sample data. Shown rather than hidden: passing
 * committed fixtures off as live readings is the one thing this product
 * cannot do.
 */
export function DataSourceBadge({ source }: { source: DataSource }) {
  if (source === "live") return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high/60 border border-outline-variant/20">
      <span className="w-1.5 h-1.5 rounded-full bg-outline" />
      <span className="font-label-sm text-label-sm text-on-surface-variant">Sample data</span>
    </span>
  );
}
