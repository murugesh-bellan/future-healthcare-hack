// Real data pulled directly from the Prometheux "Undertone Physiological Voice
// Engine" project (21d0b27cd16) — the same numbers driving its dashboards, not
// a separate synthetic set. Used as this app's sample-data fallback (the
// proven, no-credentials-needed path every screen in this app already falls
// back to) and to drive the clinician view, which has no live-auth dependency
// by design so it works regardless of whether real Supabase credentials exist.
//
// Detailed subsystem/frailty breakdowns were pulled for SP04 only (the one
// real escalation case in this cohort — a genuine single-step collapse, not
// authored) given time constraints; SP01-03 carry their real score history
// but not the full per-subsystem decomposition.

export interface CheckInScore {
  checkinId: string;
  date: string; // ISO date
  score: number;
  confidence: number;
}

export interface SubsystemContribution {
  subsystem: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface PrometheuxPatient {
  speakerId: string;
  displayName: string;
  ageContext: string; // plain-language context for the clinician view, not a diagnosis
  history: CheckInScore[];
  direction: "deteriorating" | "recovering" | "stable";
  slope: number; // points/day
  maxDrop: number;
  changePoint: boolean;
  mean: number;
  mad: number;
  /** Only populated for patients with a full subsystem pull (currently SP04). */
  componentsByCheckin?: Record<string, SubsystemContribution[]>;
  frailty?: {
    energyBasedLogOdds: { checkinId: string; date: string; logOdds: number }[];
    sarcopeniaBasedLogOdds: { checkinId: string; date: string; logOdds: number }[];
  };
}

export const PROMETHEUX_PATIENTS: PrometheuxPatient[] = [
  {
    speakerId: "SP01",
    displayName: "Speaker 01",
    ageContext: "GLP-1 programme, week 8",
    direction: "deteriorating",
    slope: -0.59,
    maxDrop: -12.12,
    changePoint: false,
    mean: 58.391,
    mad: 11.472,
    history: [
      { checkinId: "C001", date: "2024-01-05", score: 71.755, confidence: 0.9 },
      { checkinId: "C002", date: "2024-01-19", score: 70.62, confidence: 0.9 },
      { checkinId: "C003", date: "2024-02-02", score: 61.479, confidence: 0.7 },
      { checkinId: "C004", date: "2024-02-16", score: 49.362, confidence: 0.7 },
      { checkinId: "C005", date: "2024-03-01", score: 38.74, confidence: 0.7 },
    ],
  },
  {
    speakerId: "SP02",
    displayName: "Speaker 02",
    ageContext: "GLP-1 programme, week 8",
    direction: "recovering",
    slope: 0.49,
    maxDrop: 1.34,
    changePoint: false,
    mean: 61.917,
    mad: 10.231,
    history: [
      { checkinId: "C006", date: "2024-01-06", score: 44.578, confidence: 0.7 },
      { checkinId: "C007", date: "2024-01-20", score: 53.678, confidence: 0.9 },
      { checkinId: "C008", date: "2024-02-03", score: 68.19, confidence: 0.9 },
      { checkinId: "C009", date: "2024-02-17", score: 70.898, confidence: 0.9 },
      { checkinId: "C010", date: "2024-03-02", score: 72.239, confidence: 0.9 },
    ],
  },
  {
    speakerId: "SP03",
    displayName: "Speaker 03",
    ageContext: "GLP-1 programme, week 8",
    direction: "stable",
    slope: 0.0006,
    maxDrop: -5.614,
    changePoint: false,
    mean: 68.301,
    mad: 1.609,
    history: [
      { checkinId: "C011", date: "2024-01-07", score: 68.609, confidence: 0.9 },
      { checkinId: "C012", date: "2024-01-21", score: 69.893, confidence: 0.9 },
      { checkinId: "C013", date: "2024-02-04", score: 64.279, confidence: 0.9 },
      { checkinId: "C014", date: "2024-02-18", score: 70.08, confidence: 0.9 },
      { checkinId: "C015", date: "2024-03-03", score: 68.644, confidence: 0.9 },
    ],
  },
  {
    speakerId: "SP04",
    displayName: "Speaker 04",
    ageContext: "GLP-1 programme, week 8",
    direction: "deteriorating",
    slope: -0.6,
    maxDrop: -27.72,
    changePoint: true,
    mean: 58.901,
    mad: 14.733,
    history: [
      { checkinId: "C016", date: "2024-01-08", score: 71.419, confidence: 0.9 },
      { checkinId: "C017", date: "2024-01-22", score: 71.135, confidence: 0.9 },
      { checkinId: "C018", date: "2024-02-05", score: 70.981, confidence: 0.9 },
      { checkinId: "C019", date: "2024-02-19", score: 43.26, confidence: 0.7 },
      { checkinId: "C020", date: "2024-03-04", score: 37.708, confidence: 0.5 },
    ],
    componentsByCheckin: {
      C016: [
        { subsystem: "functional_capacity", weight: 0.6, value: 90.6125, contribution: 24.3675 },
        { subsystem: "fatigue_index", weight: -0.2, value: 78.39, contribution: -5.678 },
        { subsystem: "phonation_efficiency", weight: 0.2, value: 63.646, contribution: 2.729 },
      ],
      C018: [
        { subsystem: "functional_capacity", weight: 0.6, value: 90.08, contribution: 24.048 },
        { subsystem: "fatigue_index", weight: -0.2, value: 77.255, contribution: -5.451 },
        { subsystem: "phonation_efficiency", weight: 0.2, value: 61.92, contribution: 2.384 },
      ],
      C019: [
        { subsystem: "functional_capacity", weight: 0.6, value: 29.7875, contribution: -12.1275 },
        { subsystem: "fatigue_index", weight: -0.2, value: 15.175, contribution: 6.965 },
        { subsystem: "phonation_efficiency", weight: 0.2, value: 42.114, contribution: -1.577 },
      ],
      C020: [
        { subsystem: "functional_capacity", weight: 0.6, value: 21.0275, contribution: -17.3835 },
        { subsystem: "fatigue_index", weight: -0.2, value: 12.005, contribution: 7.599 },
        { subsystem: "phonation_efficiency", weight: 0.2, value: 37.463, contribution: -2.507 },
      ],
    },
    frailty: {
      energyBasedLogOdds: [
        { checkinId: "C016", date: "2024-01-08", logOdds: -0.0294 },
        { checkinId: "C017", date: "2024-01-22", logOdds: -0.02898 },
        { checkinId: "C018", date: "2024-02-05", logOdds: -0.02877 },
        { checkinId: "C019", date: "2024-02-19", logOdds: -0.02016 },
        { checkinId: "C020", date: "2024-03-04", logOdds: -0.0189 },
      ],
      sarcopeniaBasedLogOdds: [
        { checkinId: "C016", date: "2024-01-08", logOdds: 0.01044 },
        { checkinId: "C017", date: "2024-01-22", logOdds: 0.01073 },
        { checkinId: "C018", date: "2024-02-05", logOdds: 0.01102 },
        { checkinId: "C019", date: "2024-02-19", logOdds: 0.02088 },
        { checkinId: "C020", date: "2024-03-04", logOdds: 0.02291 },
      ],
    },
  },
];

export function findPatient(speakerId: string): PrometheuxPatient | undefined {
  return PROMETHEUX_PATIENTS.find((p) => p.speakerId.toLowerCase() === speakerId.toLowerCase());
}

/** Danger threshold for auto-escalation — mirrors the deliberately round, disclosed-as-illustrative
 *  thresholds used throughout this project (e.g. the muscle-integrity 58 threshold). */
export const ESCALATION_SCORE_THRESHOLD = 45;
export const ESCALATION_DROP_THRESHOLD = -20; // single-step point drop, matches Prometheux's change-point rule

export interface Escalation {
  patient: PrometheuxPatient;
  triggeredAtCheckin: string;
  triggeredDate: string;
  scoreAtTrigger: number;
  priorScore: number;
  drop: number;
}

/** Finds the real single-step drop that crossed the danger threshold, per patient — not authored. */
export function computeEscalations(): Escalation[] {
  const escalations: Escalation[] = [];
  for (const patient of PROMETHEUX_PATIENTS) {
    for (let i = 1; i < patient.history.length; i++) {
      const prior = patient.history[i - 1];
      const current = patient.history[i];
      const drop = current.score - prior.score;
      if (current.score < ESCALATION_SCORE_THRESHOLD && drop <= ESCALATION_DROP_THRESHOLD) {
        escalations.push({
          patient,
          triggeredAtCheckin: current.checkinId,
          triggeredDate: current.date,
          scoreAtTrigger: current.score,
          priorScore: prior.score,
          drop,
        });
        break; // one escalation per patient — the first crossing, not every subsequent low point
      }
    }
  }
  return escalations;
}
