import Link from "next/link";
import { PROMETHEUX_PATIENTS, computeEscalations } from "@/lib/prometheux-patients";
import { EscalationCard } from "@/components/EscalationCard";
import { requireClinician } from "@/lib/clinician-auth";

const DIRECTION_STYLE: Record<string, string> = {
  deteriorating: "bg-error/15 text-error",
  recovering: "bg-primary/15 text-primary",
  stable: "bg-surface-container-high text-on-surface-variant",
};

export default async function ClinicianPage() {
  await requireClinician();
  const escalations = computeEscalations();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-stack-lg px-container-margin py-stack-lg">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline-lg text-on-surface">Clinical review</h1>
        <p className="text-label-sm text-on-surface-variant/70">
          Human-in-the-loop · nothing here is auto-diagnosed — every flag is a suggestion for a clinician to review.
        </p>
      </header>

      {escalations.length > 0 ? (
        <section className="flex flex-col gap-stack-sm">
          <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest">
            Escalations that crossed a threshold
          </h2>
          {escalations.map((e) => (
            <EscalationCard key={e.patient.speakerId} escalation={e} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-stack-sm">
        <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest">Cohort</h2>
        <div className="overflow-hidden rounded-lg border border-outline-variant/20">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
              <tr>
                <th className="px-4 py-3 font-normal">Patient</th>
                <th className="px-4 py-3 font-normal">Latest score</th>
                <th className="px-4 py-3 font-normal">Direction</th>
                <th className="px-4 py-3 font-normal">Trend</th>
                <th className="px-4 py-3 font-normal">Largest single drop</th>
              </tr>
            </thead>
            <tbody>
              {PROMETHEUX_PATIENTS.map((p) => {
                const latest = p.history[p.history.length - 1];
                return (
                  <tr key={p.speakerId} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">
                      <Link href={`/clinician/${p.speakerId.toLowerCase()}`} className="text-body-md text-primary hover:underline">
                        {p.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-body-md text-on-surface">{Math.round(latest.score)}/100</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-label-sm ${DIRECTION_STYLE[p.direction]}`}>
                        {p.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body-md text-on-surface-variant">{p.slope.toFixed(2)} pts/day</td>
                    <td className="px-4 py-3 text-body-md text-on-surface-variant">{p.maxDrop.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
