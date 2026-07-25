"use client";

import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";

const TIPS = [
  {
    id: "protein",
    topic: "Nutrition",
    chip: "Nutrition",
    icon: "eco",
    title: "Power Up with Protein",
    body: "Maintaining lean protein intake is essential during your GLP-1 journey. Aim for simple additions like Greek yogurt or grilled chicken to support muscle health while you track your progress.",
    more: "A practical target used in muscle-preservation research is roughly 1.2–1.6 g of protein per kg of body weight per day, spread across meals rather than loaded into one. On days when appetite is low, liquid sources (milk, kefir, a shake) are usually easier to finish than a plated meal.",
    cta: "Read the guide",
  },
  {
    id: "strength",
    topic: "Movement",
    chip: "Movement",
    icon: "exercise",
    title: "Strength at Home",
    body: "Gentle resistance training preserves vitality. Try 10 minutes of bodyweight movements today to keep your energy balanced and support long-term strength.",
    more: "A simple starting circuit: 8 sit-to-stands from a chair, 8 wall push-ups, 8 heel raises, repeated twice with a rest between rounds. Resistance work two to three times a week is the part most consistently associated with holding on to muscle during weight loss.",
    cta: "Explore routine",
  },
  {
    id: "hydration",
    topic: "Habits",
    chip: "Habits",
    icon: "water_drop",
    title: "Hydration Habits",
    body: "Staying hydrated supports steady energy levels and keeps your wellness track on point.",
    more: "Reduced appetite often means reduced fluid intake too, since a lot of daily water comes from food. Anchoring a glass to things you already do — waking up, each meal, before bed — tends to work better than aiming at a daily total.",
    cta: "Why this matters",
  },
] as const;

// Derived from the content itself, so a filter can never yield an empty list.
const TOPICS = [...new Set(TIPS.map((t) => t.topic))];

export default function CoachingPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const visible = topic ? TIPS.filter((t) => t.topic === topic) : TIPS;

  return (
    <>
      <TopBar title="Undertone" />
      <main className="mx-auto max-w-2xl px-container-margin pt-24 pb-32">
        <section className="mb-stack-lg">
          <h2 className="mb-2 text-headline-xl-mobile text-on-surface">Daily Support</h2>
          <p className="text-body-md text-on-surface-variant">Small nudges for your wellness journey today.</p>
        </section>

        <section className="mb-stack-lg">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-label-md text-on-surface">Browse Topics</h4>
            {topic && (
              <button
                type="button"
                onClick={() => setTopic(null)}
                className="text-label-sm text-primary transition-transform active:scale-95"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
            {TOPICS.map((t) => {
              const active = topic === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTopic(active ? null : t)}
                  className={
                    active
                      ? "flex-shrink-0 rounded-full bg-primary-container px-4 py-2 text-label-md text-on-primary-container transition-all active:scale-95"
                      : "flex-shrink-0 rounded-full border border-outline-variant/30 bg-surface-container-high px-4 py-2 text-label-md text-on-surface transition-all hover:bg-surface-container-highest active:scale-95"
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-stack-md">
          {visible.map((tip) => {
            const open = expanded === tip.id;
            return (
              <div key={tip.id} className="relative flex flex-col gap-4 overflow-hidden rounded-lg bg-surface-container-low p-6 shadow-lg">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative z-10 flex items-start justify-between">
                  <div className="rounded-full bg-primary-container/20 p-3">
                    <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'wght' 300" }}>
                      {tip.icon}
                    </span>
                  </div>
                  <span className="rounded-full bg-surface-container-high px-3 py-1 text-label-sm text-on-surface-variant">{tip.chip}</span>
                </div>
                <div className="relative z-10">
                  <h3 className="mb-2 text-headline-md text-on-surface">{tip.title}</h3>
                  <p className="leading-relaxed text-body-md text-on-surface-variant">{tip.body}</p>
                  {open && (
                    <p className="mt-4 border-t border-outline-variant/20 pt-4 leading-relaxed text-body-md text-on-surface-variant">
                      {tip.more}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : tip.id)}
                  aria-expanded={open}
                  className="relative z-10 flex items-center gap-2 self-start pt-2 text-label-md text-primary transition-transform active:scale-95"
                >
                  {open ? "Show less" : tip.cta}
                  <span className="material-symbols-outlined transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>
                    {open ? "expand_less" : "arrow_forward"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-section-gap px-4 text-center text-label-sm text-on-surface-variant/70">
          General wellness information, not medical advice.
        </p>
      </main>
      <BottomNav />
    </>
  );
}
