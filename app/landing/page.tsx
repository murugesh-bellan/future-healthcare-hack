import Link from "next/link";

/**
 * Marketing landing page — separate from the app's own root (which is the
 * patient dashboard, reached via the demo persona picker), so this can be
 * shared/linked on its own without touching the existing, verified app flow.
 *
 * Every number below is a real, cited figure from this project's own
 * research (see docs/prometheux-reasoning-engine.md and the evidence page),
 * not marketing copy invented for this page.
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-on-background">
      <header className="border-b border-outline-variant/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-container-margin py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
              <span className="material-symbols-outlined text-[18px] text-primary">graphic_eq</span>
            </span>
            <span className="text-body-lg font-semibold text-on-surface">Undertone</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/" className="hidden text-label-md text-on-surface-variant hover:text-on-surface sm:inline">
              For patients
            </Link>
            <Link href="/clinician" className="hidden text-label-md text-on-surface-variant hover:text-on-surface sm:inline">
              For clinicians
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1 rounded-full bg-primary px-5 py-2.5 text-label-md font-semibold text-on-primary transition-transform active:scale-95"
            >
              View live demo
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute top-1/3 right-[-10%] h-[520px] w-[520px] rounded-full bg-primary/10 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 right-[5%] h-[300px] w-[300px] rounded-full bg-tertiary/10 blur-[80px]" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-container-margin py-section-gap lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-stack-lg">
            <span className="flex w-fit items-center gap-2 text-label-sm tracking-wider text-primary uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Voice-first care for the GLP-1 era
            </span>
            <h1 className="text-headline-xl leading-[1.05] text-on-surface">
              Your voice already knows. <em className="text-primary not-italic italic">Before you do.</em>
            </h1>
            <p className="max-w-lg text-body-lg text-on-surface-variant">
              40–60% of the weight lost on GLP-1 medication is lean muscle, not fat — and today, nobody's watching it
              happen between clinic visits. Undertone turns a 60-second daily voice check-in into an early, explainable
              signal, so a slow drift gets caught long before it becomes a setback.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/check-in"
                className="flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-label-md font-semibold text-on-primary shadow-lg shadow-primary/20 transition-transform active:scale-95"
              >
                Try a 60-second check-in
                <span className="material-symbols-outlined text-[18px]">mic</span>
              </Link>
              <Link href="/evidence" className="text-label-md text-on-surface-variant hover:text-on-surface">
                See the evidence →
              </Link>
            </div>

            <div className="mt-stack-md grid grid-cols-3 gap-6 border-t border-outline-variant/15 pt-stack-lg">
              <div>
                <span className="text-headline-md text-on-surface">40–60%</span>
                <p className="mt-1 text-label-sm text-on-surface-variant">of GLP-1 weight loss is lean muscle</p>
              </div>
              <div>
                <span className="text-headline-md text-on-surface">60 sec</span>
                <p className="mt-1 text-label-sm text-on-surface-variant">daily check-in, no extra hardware</p>
              </div>
              <div>
                <span className="text-headline-md text-on-surface">6</span>
                <p className="mt-1 text-label-sm text-on-surface-variant">named indices, every one explainable</p>
              </div>
            </div>
          </div>

          <div className="relative flex h-[420px] items-center justify-center">
            <div className="relative flex h-72 w-72 items-center justify-center rounded-full bg-primary/10">
              <div className="flex h-44 w-44 items-center justify-center rounded-full bg-primary/15">
                <span className="material-symbols-outlined text-[56px] text-primary">graphic_eq</span>
              </div>
            </div>

            <div className="absolute top-2 right-0 w-60 rounded-lg border border-white/5 bg-surface-container p-4 shadow-xl">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wide">Today&apos;s check-in</span>
              <p className="mt-1 text-headline-sm text-on-surface">Vocal Stability</p>
              <p className="mt-1 text-label-sm text-tertiary">Worth watching — drifted a little this week</p>
            </div>

            <div className="absolute bottom-6 left-0 w-64 rounded-lg border border-white/5 bg-surface-container p-4 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wide">Why this score</span>
              </div>
              <p className="mt-2 text-body-md text-on-surface">
                Cited to JMIR 2024, not a black box — every number traces to a named measurement.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-outline-variant/10 bg-surface-container-low/40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-container-margin py-section-gap sm:grid-cols-3">
          {[
            {
              icon: "mic",
              title: "Just talk",
              body: "One voice check-in a day, on the phone patients already carry. No wearable, no new habit to learn.",
            },
            {
              icon: "insights",
              title: "See what changed",
              body: "A friendly, plain-language summary for patients — the full evidence-cited breakdown for clinicians.",
            },
            {
              icon: "shield",
              title: "Human-in-the-loop",
              body: "Nothing here is auto-diagnosed. A sustained decline gets flagged to a clinician, who makes the call.",
            },
          ].map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                <span className="material-symbols-outlined text-[20px] text-primary">{f.icon}</span>
              </span>
              <h3 className="text-headline-sm text-on-surface">{f.title}</h3>
              <p className="text-body-md text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-outline-variant/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-container-margin py-stack-lg text-center">
          <p className="text-label-sm text-on-surface-variant">Wellness tracking, not a medical diagnosis.</p>
          <Link href="/" className="text-label-md font-semibold text-primary">
            View live demo →
          </Link>
        </div>
      </footer>
    </main>
  );
}
