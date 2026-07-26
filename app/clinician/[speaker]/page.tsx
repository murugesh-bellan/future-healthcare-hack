import Link from "next/link";
import { notFound } from "next/navigation";
import { findPatient } from "@/lib/prometheux-patients";
import { buildPatientNarrative } from "@/lib/clinical-narrative";
import { TrendChart } from "@/components/TrendChart";
import type { TrendPoint } from "@/lib/types";
import { requireClinician } from "@/lib/clinician-auth";

const SUBSYSTEM_LABELS: Record<string, string> = {
  functional_capacity: "Functional capacity",
  fatigue_index: "Fatigue",
  phonation_efficiency: "Phonation efficiency",
};

export default async function PatientDetailPage({ params }: { params: Promise<{ speaker: string }> }) {
  await requireClinician();
  const { speaker } = await params;
  const patient = findPatient(speaker);
  if (!patient) notFound();

  const points: TrendPoint[] = patient.history.map((h) => ({
    date: h.date,
    score: Math.round(h.score),
    checkInCount: 1,
  }));
  const narrative = buildPatientNarrative(patient);
  const latestCheckin = patient.history[patient.history.length - 1].checkinId;
  const latestComponents = patient.componentsByCheckin?.[latestCheckin];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-stack-lg px-container-margin py-stack-lg">
      <Link href="/clinician" className="text-label-sm text-primary">
        ← Cohort
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-headline-lg text-on-surface">{patient.displayName}</h1>
        <p className="text-label-sm text-on-surface-variant/70">{patient.ageContext}</p>
      </header>

      <section className="rounded-lg bg-surface-container p-container-margin shadow-sm">
        <h2 className="mb-3 text-label-md text-on-surface-variant uppercase tracking-widest">
          Strength score over time
        </h2>
        <TrendChart points={points} threshold={45} />
      </section>

      <section className="flex flex-col gap-stack-sm rounded-lg bg-surface-container p-container-margin shadow-sm">
        <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest">What&apos;s happening</h2>
        {narrative.map((paragraph, i) => (
          <p key={i} className="leading-relaxed text-body-md text-on-surface">
            {paragraph}
          </p>
        ))}
      </section>

      {latestComponents ? (
        <section className="flex flex-col gap-stack-sm rounded-lg bg-surface-container p-container-margin shadow-sm">
          <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest">
            Why the latest score — subsystem breakdown
          </h2>
          <div className="overflow-hidden rounded-md border border-outline-variant/20">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 font-normal">Subsystem</th>
                  <th className="px-3 py-2 font-normal">Value</th>
                  <th className="px-3 py-2 font-normal">Weight</th>
                  <th className="px-3 py-2 font-normal">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {latestComponents.map((c) => (
                  <tr key={c.subsystem} className="border-t border-outline-variant/10">
                    <td className="px-3 py-2 text-body-md text-on-surface">
                      {SUBSYSTEM_LABELS[c.subsystem] ?? c.subsystem}
                    </td>
                    <td className="px-3 py-2 text-body-md text-on-surface-variant">{Math.round(c.value)}/100</td>
                    <td className="px-3 py-2 text-body-md text-on-surface-variant">{c.weight}</td>
                    <td className={`px-3 py-2 text-body-md ${c.contribution < 0 ? "text-error" : "text-primary"}`}>
                      {c.contribution > 0 ? "+" : ""}
                      {c.contribution.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-label-sm text-on-surface-variant/60">
            Contribution = weight × (value − 50), summed with a 50-point baseline to produce the Strength Score above.
          </p>
        </section>
      ) : null}

      {patient.frailty ? (
        <section className="flex flex-col gap-stack-sm rounded-lg bg-surface-container p-container-margin shadow-sm">
          <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest">Frailty risk axes (JMIR 2024)</h2>
          <p className="text-label-sm text-on-surface-variant/70">
            Real logistic-regression log-odds coefficients from the cited study, correctly signed — not a calibrated
            probability (the study&apos;s intercept and other covariates aren&apos;t available here).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { label: "Energy-based frailty (A1 / zero-crossing axis)", series: patient.frailty.energyBasedLogOdds },
                { label: "Sarcopenia-based frailty (A2 / shimmer axis)", series: patient.frailty.sarcopeniaBasedLogOdds },
              ] as const
            ).map(({ label, series }) => {
              const latest = series[series.length - 1];
              return (
                <div key={label} className="flex flex-col gap-1 rounded-md bg-surface-container-low p-3">
                  <span className="text-label-sm text-on-surface-variant">{label}</span>
                  <span className="text-body-md font-semibold text-on-surface">
                    {latest.logOdds >= 0 ? "+" : ""}
                    {latest.logOdds.toFixed(4)} log-odds
                  </span>
                  <span className="text-label-sm text-on-surface-variant/60">as of {latest.date}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
