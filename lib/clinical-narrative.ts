// Turns a patient's real computed numbers into plain-language, evidence-cited
// sentences for the clinician view. Deliberately template-based over the real
// values rather than an LLM call — every sentence traces back to a specific
// number already shown on screen, so nothing here can say something the data
// doesn't support.

import type { PrometheuxPatient } from "./prometheux-patients";

const SUBSYSTEM_LABELS: Record<string, string> = {
  functional_capacity: "functional capacity",
  fatigue_index: "fatigue",
  phonation_efficiency: "phonation efficiency",
};

export function explainTrend(patient: PrometheuxPatient): string {
  const latest = patient.history[patient.history.length - 1];
  const baseline = Math.round(patient.mean);
  if (patient.direction === "deteriorating") {
    return `${patient.displayName}'s Strength Score has trended downward, averaging ${baseline}/100 over this period and now sitting at ${Math.round(latest.score)}/100 (${patient.slope.toFixed(2)} points/day).`;
  }
  if (patient.direction === "recovering") {
    return `${patient.displayName}'s Strength Score has been trending upward, now at ${Math.round(latest.score)}/100 against a ${baseline}/100 average for this period (+${patient.slope.toFixed(2)} points/day).`;
  }
  return `${patient.displayName}'s Strength Score has held steady around ${baseline}/100 across this period, with normal day-to-day variation (±${patient.mad.toFixed(1)} points).`;
}

/** The single largest driver of change between two check-ins, in plain language, or null if no breakdown data exists. */
export function explainDriver(
  patient: PrometheuxPatient,
  fromCheckinId: string,
  toCheckinId: string,
): string | null {
  const from = patient.componentsByCheckin?.[fromCheckinId];
  const to = patient.componentsByCheckin?.[toCheckinId];
  if (!from || !to) return null;

  const deltas = to.map((toRow) => {
    const fromRow = from.find((r) => r.subsystem === toRow.subsystem);
    const delta = fromRow ? toRow.contribution - fromRow.contribution : 0;
    return { subsystem: toRow.subsystem, delta, value: toRow.value, fromValue: fromRow?.value ?? toRow.value };
  });
  const biggest = deltas.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
  const label = SUBSYSTEM_LABELS[biggest.subsystem] ?? biggest.subsystem;
  const direction = biggest.delta < 0 ? "fell" : "rose";

  return `The largest driver was ${label}, which ${direction} from ${Math.round(biggest.fromValue)}/100 to ${Math.round(biggest.value)}/100 over the same window — a ${Math.abs(Math.round(biggest.delta))}-point swing in its contribution to the overall score.`;
}

export function explainFrailtyAxes(patient: PrometheuxPatient): string | null {
  if (!patient.frailty) return null;
  const ebf = patient.frailty.energyBasedLogOdds;
  const sbf = patient.frailty.sarcopeniaBasedLogOdds;
  const ebfTrend = ebf[ebf.length - 1].logOdds - ebf[0].logOdds;
  const sbfTrend = sbf[sbf.length - 1].logOdds - sbf[0].logOdds;

  const parts: string[] = [];
  if (sbfTrend > 0.005) {
    parts.push(
      "the sarcopenia-based frailty axis (amplitude-perturbation markers, JMIR 2024) has risen over the same period",
    );
  }
  if (ebfTrend > 0.005) {
    parts.push("the energy-based frailty axis (zero-crossing markers, JMIR 2024) has also moved in the same direction");
  }
  if (parts.length === 0) return null;
  return `Both published frailty axes back this: ${parts.join(", and ")}.`;
}

/** Full explanation, as a list of paragraphs, for the clinician detail view. */
export function buildPatientNarrative(patient: PrometheuxPatient): string[] {
  const paragraphs = [explainTrend(patient)];
  if (patient.history.length >= 2) {
    const from = patient.history[patient.history.length - 2];
    const to = patient.history[patient.history.length - 1];
    const driver = explainDriver(patient, from.checkinId, to.checkinId);
    if (driver) paragraphs.push(driver);
  }
  const frailty = explainFrailtyAxes(patient);
  if (frailty) paragraphs.push(frailty);
  return paragraphs;
}
