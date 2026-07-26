// Server-only: parses lib/data/contribution_weight.csv, the single source of
// truth for every coefficient the scoring pipeline (lib/scoring.ts) uses.
// Mirrors the .vada engine's own design — weights are looked up from a table,
// never embedded as literals in the scoring logic. Most rows are illustrative
// (hand-picked, no published coefficient); a couple are real JMIR 2024
// ln(OR) values — see each row's Rationale/Citation_id.
import fs from "node:fs";
import path from "node:path";
import { parseCsvWithHeader } from "@/lib/csv";

export interface ContributionWeightRow {
  sourceFeature: string;
  targetConstruct: string;
  weight: number;
  rationale: string;
  citationId: string | null;
}

const CSV_PATH = path.join(process.cwd(), "lib/data/contribution_weight.csv");

let cache: ContributionWeightRow[] | null = null;

function load(): ContributionWeightRow[] {
  if (cache) return cache;
  const text = fs.readFileSync(CSV_PATH, "utf8");
  const { header, rows } = parseCsvWithHeader(text);
  const col = (name: string) => header.indexOf(name);
  const iFeature = col("Source_feature");
  const iConstruct = col("Target_construct");
  const iWeight = col("Weight");
  const iRationale = col("Rationale");
  const iCitation = col("Citation_id");

  cache = rows.map((r) => ({
    sourceFeature: r[iFeature],
    targetConstruct: r[iConstruct],
    weight: Number(r[iWeight]),
    rationale: r[iRationale] ?? "",
    citationId: r[iCitation] ? r[iCitation] : null,
  }));
  return cache;
}

/** Looks up a single (feature, construct) weight. Throws if the pair isn't in the table — a missing weight is a bug, not a fallback-able state. */
export function getWeight(sourceFeature: string, targetConstruct: string): number {
  const row = load().find((r) => r.sourceFeature === sourceFeature && r.targetConstruct === targetConstruct);
  if (!row) throw new Error(`No contribution weight for ${sourceFeature} -> ${targetConstruct}`);
  return row.weight;
}

/** All rows contributing to a given construct, in file order — used to build human-readable formula/explainability text. */
export function getWeightsForConstruct(targetConstruct: string): ContributionWeightRow[] {
  return load().filter((r) => r.targetConstruct === targetConstruct);
}
