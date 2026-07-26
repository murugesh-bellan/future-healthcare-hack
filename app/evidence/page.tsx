"use client";

import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import type { Citation } from "@/lib/types";

const CITATIONS: Citation[] = [
  {
    id: "cit_001",
    metricLabel: "Muscle-Integrity Index",
    claim: "Voice features can classify frailty because vocal cords are muscle.",
    source: "Vocal biomarkers of sarcopenic frailty",
    venue: "JMIR",
    year: 2024,
    sampleSize: null,
  },
  {
    id: "cit_002",
    metricLabel: "Cardiac risk signal",
    claim: "Voice AI identified heart failure decompensation with 76-81% sensitivity, vs ~20% for daily weight checks.",
    source: "HearO",
    venue: "AHA",
    year: 2023,
    sampleSize: null,
  },
  {
    id: "cit_003",
    metricLabel: "Metabolic risk signal",
    claim: "Voice AI identified type 2 diabetes in a cohort of 607 people.",
    source: "Voice-based diabetes detection",
    venue: "PLOS",
    year: 2024,
    sampleSize: 607,
  },
];

export default function EvidencePage() {
  const [openId, setOpenId] = useState<string | null>(CITATIONS[0]?.id ?? null);

  return (
    <>
      <TopBar title="Undertone" icon="settings" />
      <main className="mx-auto min-h-screen max-w-2xl px-container-margin pt-24 pb-32">
        <section className="mb-stack-lg">
          <h1 className="mb-2 text-headline-md text-on-surface">The science behind your score</h1>
          <div className="h-1 w-12 rounded-full bg-primary" />
        </section>

        <section className="space-y-stack-md">
          {CITATIONS.map((citation, i) => {
            const open = citation.id === openId;
            return (
              <div key={citation.id}>
                <button
                  onClick={() => setOpenId(open ? null : citation.id)}
                  className="w-full cursor-pointer rounded-lg p-stack-md text-left transition-colors hover:bg-surface-container-lowest"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-label-sm tracking-wider text-primary uppercase">{citation.metricLabel}</span>
                      <p className="text-body-md text-on-surface">{citation.claim}</p>
                    </div>
                    <span
                      className="material-symbols-outlined text-on-surface-variant transition-transform"
                      style={{ transform: open ? "rotate(180deg)" : "none" }}
                    >
                      expand_more
                    </span>
                  </div>
                  {open ? (
                    <div className="mt-4 flex flex-col gap-1 opacity-70">
                      <span className="text-label-sm text-on-surface-variant">Citation: &quot;{citation.source}&quot;</span>
                      <span className="text-label-sm text-on-surface-variant">
                        {citation.venue}, {citation.year}
                        {citation.sampleSize ? ` | n=${citation.sampleSize}` : ""}
                      </span>
                    </div>
                  ) : null}
                </button>
                {i < CITATIONS.length - 1 ? <div className="mx-2 h-px bg-outline-variant/30" /> : null}
              </div>
            );
          })}
        </section>

        <section className="mt-section-gap border-t border-outline-variant/20 pt-stack-lg">
          <a
            href="https://platform.prometheux.ai/apps/21d0b27cd16/f42d8ae1-6a09-4584-94eb-7d580ed31ef5"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg bg-surface-container-high/30 p-6 transition-colors hover:bg-surface-container-high/50"
          >
            <div>
              <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest">See how it&apos;s calculated</h2>
              <p className="mt-2 leading-relaxed text-body-md text-on-surface-variant/80">
                Every score traces back to named, weighted contributions — not a black box. View the full reasoning
                engine, including the live evidence and weight table behind each measurement.
              </p>
            </div>
            <span className="material-symbols-outlined shrink-0 pl-4 text-on-surface-variant">open_in_new</span>
          </a>
        </section>

        <section className="mt-section-gap border-t border-outline-variant/20 pt-stack-lg">
          <div className="rounded-lg bg-surface-container-high/30 p-6">
            <h2 className="mb-3 text-label-md text-on-surface-variant uppercase tracking-widest">What this isn&apos;t</h2>
            <p className="leading-relaxed text-body-md text-on-surface-variant/80">
              Undertone is a wellness tool, not a medical device. The Strength Score is for informational purposes
              only and does not diagnose, treat, or prevent any medical condition. Always consult your care team.
            </p>
          </div>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
