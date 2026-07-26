import type { PatientProfile } from "@/lib/types";
import { formatShortDate } from "@/lib/trend";

/**
 * Static profile facts (age, sex, height, weight, programme) for the Trends
 * page — context alongside the score, not a driver of it. Shows the
 * enrollment date as-is rather than a computed "week N" (elapsed-time math
 * against real wall-clock time doesn't make sense for sample data, whose
 * dates are fixed historical Prometheux check-in dates, not tied to today).
 */
export function PatientProfileSection({ profile }: { profile: PatientProfile }) {
  const fields: { label: string; value: string }[] = [
    profile.age !== null ? { label: "Age", value: `${profile.age}` } : null,
    profile.sex ? { label: "Sex", value: profile.sex } : null,
    profile.heightCm !== null ? { label: "Height", value: `${profile.heightCm} cm` } : null,
    profile.weightKg !== null ? { label: "Weight", value: `${profile.weightKg} kg` } : null,
    profile.enrolledDate ? { label: "Enrolled", value: formatShortDate(profile.enrolledDate) } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  if (fields.length === 0) return null;

  return (
    <section className="flex flex-col gap-stack-sm rounded-lg bg-surface-container p-container-margin shadow-sm">
      <div>
        <h2 className="text-body-md font-semibold text-on-surface">Patient profile</h2>
        {profile.cohort ? <p className="text-label-sm text-on-surface-variant/70">{profile.cohort}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5">
            <span className="text-label-sm text-on-surface-variant/70 uppercase tracking-wide">{f.label}</span>
            <span className="text-body-md text-on-surface">{f.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
