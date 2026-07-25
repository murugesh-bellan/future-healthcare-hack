"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  {
    n: 1,
    title: "Tap the microphone",
    body: "Find the round button at the centre of your dashboard to begin your daily check-in.",
  },
  {
    n: 2,
    title: "Talk for 20 seconds",
    body: "No script needed. Just speak naturally about how you feel, your energy, and your progress.",
  },
  {
    n: 3,
    title: "See your trends",
    body: "Watch your charts build up over time, so small changes are easy to notice early.",
  },
] as const;

export default function HowItWorksPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const readAloud = () => {
    if (typeof globalThis.speechSynthesis === "undefined") return;
    const current = STEPS[step];
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.speak(new SpeechSynthesisUtterance(`${current.title}. ${current.body}`));
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed top-0 z-50 w-full bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-container-margin py-4">
          <span className="text-headline-md font-semibold text-primary">Getting started</span>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-label-md text-on-surface-variant transition-colors hover:text-primary active:scale-95"
          >
            Skip
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-grow flex-col px-container-margin pt-24 pb-40">
        <div className="mb-stack-md flex justify-end">
          <button
            type="button"
            onClick={readAloud}
            className="flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">volume_up</span>
            <span className="text-label-sm">Read this aloud</span>
          </button>
        </div>

        <div className="flex flex-col gap-stack-lg">
          <h1 className="text-headline-xl-mobile text-on-surface">How it works</h1>

          <div className="flex flex-col gap-gutter">
            {STEPS.map((s, i) => {
              const current = i === step;
              const done = i < step;
              return (
                <div
                  key={s.n}
                  aria-current={current ? "step" : undefined}
                  className={
                    current
                      ? "flex items-start gap-gutter rounded-lg border border-primary/30 bg-surface-container/70 p-stack-md transition-all"
                      : "flex items-start gap-gutter rounded-lg border border-white/5 bg-surface-container/30 p-stack-md opacity-55 transition-all"
                  }
                >
                  <div
                    className={
                      current || done
                        ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container shadow-sm"
                        : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high shadow-sm"
                    }
                  >
                    <span
                      className={
                        current || done
                          ? "text-headline-md font-semibold text-on-primary-container"
                          : "text-headline-md font-semibold text-on-surface"
                      }
                    >
                      {done ? "✓" : s.n}
                    </span>
                  </div>
                  <div className="pt-1">
                    <h2 className="text-headline-md text-on-surface">{s.title}</h2>
                    <p className="mt-1 text-body-md text-on-surface-variant">{s.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-4 rounded-lg border border-white/5 p-container-margin shadow-lg">
            <div className="flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-4 py-2">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">lock</span>
              <span className="text-center text-label-sm text-on-surface-variant">
                Your voice is processed securely and not stored after analysis.
              </span>
            </div>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 w-full border-t border-white/5 bg-background/90 px-container-margin pt-4 pb-8 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex h-[56px] items-center justify-center rounded-full bg-surface-container-high px-8 text-on-surface transition-all duration-200 hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="material-symbols-outlined mr-2">chevron_left</span>
            <span className="text-label-md">Back</span>
          </button>

          <div className="flex gap-2" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.n} className={i === step ? "h-2 w-6 rounded-full bg-primary" : "h-2 w-2 rounded-full bg-outline/40"} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => (isLast ? router.push("/") : setStep((s) => s + 1))}
            className="flex h-[56px] items-center justify-center rounded-full bg-primary px-8 font-bold text-on-primary shadow-lg shadow-primary/20 transition-all duration-200 hover:brightness-110 active:scale-95"
          >
            <span className="text-label-md">{isLast ? "Get started" : "Next"}</span>
            <span className="material-symbols-outlined ml-2">chevron_right</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
