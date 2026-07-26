"use client";

import { useState } from "react";
import Link from "next/link";
import type { Escalation } from "@/lib/prometheux-patients";
import { ESCALATION_SCORE_THRESHOLD, ESCALATION_DROP_THRESHOLD } from "@/lib/prometheux-patients";

/**
 * Matches the reasoning-trace card design: the rule, the real numbers that
 * fired it, and a human decision point. Approve/Dismiss update local state
 * only — no backend write exists for this yet, and that's disclosed rather
 * than faked as a persisted action.
 */
export function EscalationCard({ escalation }: { escalation: Escalation }) {
  const [status, setStatus] = useState<"open" | "approved" | "dismissed">("open");
  const { patient, triggeredAtCheckin, triggeredDate, scoreAtTrigger, priorScore, drop } = escalation;

  return (
    <div className="rounded-lg border border-error/30 bg-surface-container-lowest p-container-margin shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-error" />
          <span className="text-body-md font-semibold text-on-surface">
            Priority flag · {patient.displayName} · {patient.ageContext}
          </span>
        </div>
        <span className="text-label-sm text-on-surface-variant/60">from check-in {triggeredAtCheckin} · {triggeredDate}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-label-sm tracking-wider text-on-surface-variant uppercase">
            Why this escalated — reasoning trace
          </p>
          <pre className="overflow-x-auto rounded-md bg-surface-container-high/60 p-3 text-[11px] leading-relaxed text-on-surface-variant">
{`RULE strength_score_escalation:
  IF   strength_score(latest) < ${ESCALATION_SCORE_THRESHOLD}
       → ${scoreAtTrigger.toFixed(1)} ✓
  AND  single_step_drop <= ${ESCALATION_DROP_THRESHOLD}
       → ${drop.toFixed(1)} (from ${priorScore.toFixed(1)}) ✓
  THEN escalate(priority: high)

evidence:
  • functional_capacity fell sharply
    in the same check-in
  • sarcopenia-based frailty axis
    rising (JMIR 2024)`}
          </pre>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-label-sm tracking-wider text-on-surface-variant uppercase">Suggested action</p>
          <ul className="list-disc space-y-1 pl-4 text-body-md text-on-surface">
            <li>Review voice check-in history and recent functional-capacity trend</li>
            <li>Consider confirmatory assessment (DEXA / bioimpedance) if consistent with clinical picture</li>
            <li>Reach out before the next scheduled check-in</li>
          </ul>
          <p className="text-label-sm text-on-surface-variant/70 italic">
            Flagged from a routine voice check-in, days before this would typically surface at a clinic visit.
          </p>

          {status === "open" ? (
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setStatus("approved")}
                className="rounded-full bg-primary px-5 py-2 text-label-md font-semibold text-on-primary transition-transform active:scale-95"
              >
                Approve &amp; follow up
              </button>
              <button
                onClick={() => setStatus("dismissed")}
                className="rounded-full bg-surface-container-high px-5 py-2 text-label-md text-on-surface-variant transition-transform active:scale-95"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <p className="text-label-md font-semibold text-primary">
              {status === "approved" ? "Follow-up approved." : "Dismissed."}
            </p>
          )}
          <Link href={`/clinician/${patient.speakerId.toLowerCase()}`} className="text-label-sm text-primary">
            View full patient detail →
          </Link>
        </div>
      </div>
    </div>
  );
}
