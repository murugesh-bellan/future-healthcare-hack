// Server-only: parses lib/data/clinical_evidence.csv, the provenance record
// for each Citation_id referenced in contribution_weight.csv. Most weight
// rows have no citation (illustrative); this file only ever needs to cover
// the ones that do.
import fs from "node:fs";
import path from "node:path";
import { parseCsvWithHeader } from "@/lib/csv";

export interface ClinicalEvidenceRow {
  citationId: string;
  source: string;
  finding: string;
  /** Null when no DOI/link is on record yet — never fabricate one. */
  url: string | null;
}

const CSV_PATH = path.join(process.cwd(), "lib/data/clinical_evidence.csv");

let cache: ClinicalEvidenceRow[] | null = null;

function load(): ClinicalEvidenceRow[] {
  if (cache) return cache;
  const text = fs.readFileSync(CSV_PATH, "utf8");
  const { header, rows } = parseCsvWithHeader(text);
  const col = (name: string) => header.indexOf(name);
  const iCitation = col("Citation_id");
  const iSource = col("Source");
  const iFinding = col("Finding");
  const iUrl = col("Url");

  cache = rows.map((r) => ({
    citationId: r[iCitation],
    source: r[iSource],
    finding: r[iFinding],
    url: r[iUrl] ? r[iUrl] : null,
  }));
  return cache;
}

/** Looks up a citation's provenance by id. Returns null if there's no record — most weights are uncited, so this is an expected outcome, not an error. */
export function getEvidence(citationId: string): ClinicalEvidenceRow | null {
  return load().find((r) => r.citationId === citationId) ?? null;
}
