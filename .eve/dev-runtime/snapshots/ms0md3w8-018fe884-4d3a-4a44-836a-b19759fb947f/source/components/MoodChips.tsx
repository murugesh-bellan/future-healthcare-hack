"use client";

import { useState } from "react";

const MOOD_CHIPS = ["Energized", "Steady", "Tired", "Nauseous"] as const;

export function MoodChips() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mt-stack-md flex gap-2 overflow-x-auto w-full pb-2 no-scrollbar">
      {MOOD_CHIPS.map((mood) => {
        const active = selected === mood;
        return (
          <button
            key={mood}
            type="button"
            aria-pressed={active}
            onClick={() => setSelected(active ? null : mood)}
            className={
              active
                ? "whitespace-nowrap px-4 py-2 bg-primary-container text-on-primary-container rounded-full font-label-md text-label-md transition-colors active:scale-95"
                : "whitespace-nowrap px-4 py-2 bg-surface-container text-on-surface rounded-full font-label-md text-label-md hover:bg-surface-container-high transition-colors active:scale-95"
            }
          >
            {mood}
          </button>
        );
      })}
    </div>
  );
}
