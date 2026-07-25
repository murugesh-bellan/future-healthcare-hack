// Ports the Undertone_Physiological_Voice_Engine .vada (Datalog) pipeline into
// TypeScript: raw acoustic features -> 6 physiological constructs -> fatigue
// index + functional capacity -> strength-score decomposition -> strength
// score. Weights are looked up from contribution_weight.csv (via
// lib/contribution-weights.ts), never embedded as literals here, mirroring
// the original engine's design. Illustrative — see contribution_weight.csv's
// own Rationale column for which coefficients are real vs. hand-picked.
import { getWeight } from "@/lib/contribution-weights";
import type { SignalQuality } from "@/lib/voice-signals";

/**
 * The subset of a recording's acoustic features the scoring pipeline reads,
 * in the units each formula expects. Every field is nullable: a missing
 * feature (not measured, or an older/partial client that didn't send it)
 * must omit the constructs that depend on it, never stand in for a measured
 * value — see `requireAll` below.
 */
export interface RawScoringFeatures {
  /** 0-1 fraction. */
  zcr: number | null;
  /** Percent (e.g. 1.8 for 1.8%) — converted to a 0-1 fraction internally, null if pitch wasn't detected. */
  jitterPercent: number | null;
  /** Percent — converted to a 0-1 fraction internally. */
  shimmerPercent: number | null;
  /** Unitless coefficient of variation (pitchStdHz / meanPitchHz), null if pitch wasn't detected. */
  f0Cv: number | null;
  /** dB, null if no voiced frames were found. */
  hnrDb: number | null;
  /** 0-1 fraction. */
  voicedRatio: number | null;
  /** 0-1 fraction. */
  pauseRatio: number | null;
  /** 0-1 fraction, ~0.55 typical. */
  energyNormalized: number | null;
  /** Syllables per second, null if the transcript was empty or duration was zero. */
  speechRateSyllPerSec: number | null;
  /** dB spectral tilt. */
  alphaRatioDb: number | null;
  signalQuality: SignalQuality;
}

export interface ConstructResult {
  name: string;
  value: number;
  confidence: number;
  formula: string;
}

export interface DecompositionRow {
  subsystem: string;
  weight: number;
  value: number;
  contribution: number;
}

export type FrailtyAxis = "energy_based_frailty" | "sarcopenia_based_frailty";

/**
 * A clinical frailty signal from a real JMIR 2024 logistic-regression study
 * (citation EV001 in clinical_evidence.csv) — but only that study's own
 * coefficient times the measured feature, i.e. one term of a linear
 * predictor. This is NOT the model's log-odds: a real log-odds needs the
 * regression's intercept and any other covariates it was fit with, neither
 * of which is available here (contribution_weight.csv stores only the
 * coefficient). Do not derive a probability/likelihood from this value —
 * it is not calibrated and was previously mislabeled as one.
 */
export interface FrailtyAxisResult {
  axis: FrailtyAxis;
  coefficientContribution: number;
  confidence: number;
}

export interface ScoringResult {
  /** physiological_constructs rows: the 6 base constructs plus fatigue_index. */
  constructs: ConstructResult[];
  /** functional_biomarkers row — null when an upstream construct is missing. */
  functionalCapacity: { value: number; formula: string } | null;
  /** score_decompositions rows — one per subsystem that had a value this check-in. */
  decomposition: DecompositionRow[];
  /** strength_scores row — null when no subsystem produced a decomposition row. */
  strengthScore: { value: number; confidence: number } | null;
  /** frailty_assessments rows — the two JMIR 2024 axes, each omitted when its input feature is missing. */
  frailty: FrailtyAxisResult[];
}

function confidenceFromSignalQuality(q: SignalQuality): number {
  return q === "high" ? 0.9 : q === "medium" ? 0.7 : 0.5;
}

function clamp0to100(raw: number): number {
  return Math.max(0, Math.min(100, raw));
}

/** Returns null if any input is null — mirrors the Datalog engine's behavior of a rule simply not firing when a fact is missing. */
function requireAll<T extends readonly (number | null)[]>(values: T): { [K in keyof T]: number } | null {
  if (values.some((v) => v === null)) return null;
  return values as unknown as { [K in keyof T]: number };
}

function muscleIntegrityIndex(f: RawScoringFeatures): ConstructResult | null {
  const inputs = requireAll([f.zcr, f.shimmerPercent] as const);
  if (!inputs) return null;
  const [zcr, shimmerPercent] = inputs;
  const wZcr = getWeight("zero_crossing_rate", "muscle_integrity_index");
  const wShimmer = getWeight("shimmer", "muscle_integrity_index");
  // shimmerPercent is already stored as a 0-100 percent, matching the engine's "Shimmer×100" magnitude directly.
  const logOdds = -wZcr * (zcr * 100) + -wShimmer * shimmerPercent;
  const value = clamp0to100(50 + 50 * logOdds);
  return {
    name: "muscle_integrity_index",
    value,
    confidence: confidenceFromSignalQuality(f.signalQuality),
    formula: `50 + 50×(${-wZcr}×ZCR% + ${-wShimmer}×Shimmer%)`,
  };
}

/**
 * energy_based_frailty (A1): the zero-crossing-rate arm of the same real JMIR
 * 2024 study feeding muscle_integrity_index, exposed on its own — reuses
 * wZcr directly (no sign flip, unlike muscle_integrity_index which negates
 * it to express "integrity" rather than frailty itself). This is only the
 * coefficient's own contribution — see FrailtyAxisResult's doc comment for
 * why it is not a full model log-odds.
 */
function energyBasedFrailty(f: RawScoringFeatures): FrailtyAxisResult | null {
  const inputs = requireAll([f.zcr] as const);
  if (!inputs) return null;
  const [zcr] = inputs;
  const wZcr = getWeight("zero_crossing_rate", "muscle_integrity_index");
  return {
    axis: "energy_based_frailty",
    coefficientContribution: wZcr * (zcr * 100),
    confidence: confidenceFromSignalQuality(f.signalQuality),
  };
}

/** sarcopenia_based_frailty (A2): the shimmer arm of the same JMIR study, same reasoning as energyBasedFrailty above. */
function sarcopeniaBasedFrailty(f: RawScoringFeatures): FrailtyAxisResult | null {
  const inputs = requireAll([f.shimmerPercent] as const);
  if (!inputs) return null;
  const [shimmerPercent] = inputs;
  const wShimmer = getWeight("shimmer", "muscle_integrity_index");
  // shimmerPercent is already a 0-100 percent, matching the engine's "Shimmer×100" magnitude directly.
  return {
    axis: "sarcopenia_based_frailty",
    coefficientContribution: wShimmer * shimmerPercent,
    confidence: confidenceFromSignalQuality(f.signalQuality),
  };
}

function vocalStabilityIndex(f: RawScoringFeatures): ConstructResult | null {
  const inputs = requireAll([f.jitterPercent, f.shimmerPercent, f.f0Cv] as const);
  if (!inputs) return null;
  const [jitterPercent, shimmerPercent, f0Cv] = inputs;
  const wJitter = getWeight("jitter", "vocal_stability_index");
  const wShimmer = getWeight("shimmer", "vocal_stability_index");
  const wF0cv = getWeight("f0_cv", "vocal_stability_index");
  // jitterPercent/shimmerPercent are already 0-100 percents, matching the engine's "×100" magnitude directly.
  const raw = 50 + 50 * (wJitter * jitterPercent + wShimmer * shimmerPercent + wF0cv * (f0Cv * 100));
  return {
    name: "vocal_stability_index",
    value: clamp0to100(raw),
    confidence: confidenceFromSignalQuality(f.signalQuality),
    formula: `50 + 50×(${wJitter}×Jitter% + ${wShimmer}×Shimmer% + ${wF0cv}×F0cv%)`,
  };
}

function respiratorySupportIndex(f: RawScoringFeatures): ConstructResult | null {
  const inputs = requireAll([f.voicedRatio, f.pauseRatio, f.energyNormalized] as const);
  if (!inputs) return null;
  const [voicedRatio, pauseRatio, energyNormalized] = inputs;
  const wVoiced = getWeight("voiced_ratio", "respiratory_support_index");
  const wPause = getWeight("pause_ratio", "respiratory_support_index");
  const wEnergy = getWeight("energy", "respiratory_support_index");
  const raw =
    50 +
    50 * (wVoiced * (voicedRatio * 100 - 65) + wPause * (pauseRatio * 100 - 25) + wEnergy * (energyNormalized * 100 - 55));
  return {
    name: "respiratory_support_index",
    value: clamp0to100(raw),
    confidence: confidenceFromSignalQuality(f.signalQuality),
    formula: `50 + 50×(${wVoiced}×(Voiced%-65) + ${wPause}×(Pause%-25) + ${wEnergy}×(Energy%-55))`,
  };
}

function phonationEfficiency(f: RawScoringFeatures): ConstructResult | null {
  const inputs = requireAll([f.hnrDb, f.jitterPercent, f.shimmerPercent] as const);
  if (!inputs) return null;
  const [hnrDb, jitterPercent, shimmerPercent] = inputs;
  const wHnr = getWeight("hnr", "phonation_efficiency");
  const wJitter = getWeight("jitter", "phonation_efficiency");
  const wShimmer = getWeight("shimmer", "phonation_efficiency");
  const raw = 50 + 50 * (wHnr * (hnrDb - 16) + wJitter * jitterPercent + wShimmer * shimmerPercent);
  return {
    name: "phonation_efficiency",
    value: clamp0to100(raw),
    confidence: confidenceFromSignalQuality(f.signalQuality),
    formula: `50 + 50×(${wHnr}×(HNR-16) + ${wJitter}×Jitter% + ${wShimmer}×Shimmer%)`,
  };
}

function motorCoordinationIndex(f: RawScoringFeatures): ConstructResult | null {
  const inputs = requireAll([f.speechRateSyllPerSec, f.pauseRatio, f.jitterPercent] as const);
  if (!inputs) return null;
  const [rate, pauseRatio, jitterPercent] = inputs;
  const wRate = getWeight("speech_rate", "motor_coordination_index");
  const wPause = getWeight("pause_ratio", "motor_coordination_index");
  const wJitter = getWeight("jitter", "motor_coordination_index");
  const raw = 50 + 50 * (wRate * ((rate - 4) * 20) + wPause * (pauseRatio * 100 - 25) + wJitter * jitterPercent);
  return {
    name: "motor_coordination_index",
    value: clamp0to100(raw),
    confidence: confidenceFromSignalQuality(f.signalQuality),
    formula: `50 + 50×(${wRate}×((Rate-4)×20) + ${wPause}×(Pause%-25) + ${wJitter}×Jitter%)`,
  };
}

function resonanceStability(f: RawScoringFeatures): ConstructResult | null {
  const inputs = requireAll([f.hnrDb, f.alphaRatioDb] as const);
  if (!inputs) return null;
  const [hnrDb, alphaRatioDb] = inputs;
  const wAlpha = getWeight("alpha_ratio", "resonance_stability");
  const wHnr = getWeight("hnr", "resonance_stability");
  const raw = 50 + 50 * (wAlpha * (alphaRatioDb + 14) + wHnr * (hnrDb - 16));
  return {
    name: "resonance_stability",
    value: clamp0to100(raw),
    confidence: confidenceFromSignalQuality(f.signalQuality),
    formula: `50 + 50×(${wAlpha}×(Alpha+14) + ${wHnr}×(HNR-16))`,
  };
}

function fatigueIndex(vsi: ConstructResult | null, rsi: ConstructResult | null): ConstructResult | null {
  if (!vsi || !rsi) return null;
  const wVsi = getWeight("vocal_stability_index", "fatigue_index");
  const wRsi = getWeight("respiratory_support_index", "fatigue_index");
  // Weights are negative (fatigue rises as stability/support FALL), so this must be
  // additive — 50 + weighted deviation — not 50 minus it. The .vada source's
  // "50 - ..." here inverted the direction (better VSI/RSI raised fatigue instead of
  // lowering it); fixed to match its own stated intent and the sign of the weights.
  const raw = 50 + wVsi * (vsi.value - 50) + wRsi * (rsi.value - 50);
  return {
    name: "fatigue_index",
    value: clamp0to100(raw),
    // Weakest link: confidence is the smaller of the two upstream confidences.
    confidence: Math.min(vsi.confidence, rsi.confidence),
    formula: `50 + ${wVsi}×(VSI-50) + ${wRsi}×(RSI-50)`,
  };
}

function functionalCapacity(
  mii: ConstructResult | null,
  rsi: ConstructResult | null,
  mci: ConstructResult | null,
): { value: number; formula: string } | null {
  if (!mii || !rsi || !mci) return null;
  const wMii = getWeight("muscle_integrity_index", "functional_capacity");
  const wRsi = getWeight("respiratory_support_index", "functional_capacity");
  const wMci = getWeight("motor_coordination_index", "functional_capacity");
  const raw = wMii * mii.value + wRsi * rsi.value + wMci * mci.value;
  return {
    value: clamp0to100(raw),
    formula: `${wMii}×MII + ${wRsi}×RSI + ${wMci}×MCI`,
  };
}

/** score_decompositions: contribution = weight × (subsystem value − 50), skipped for subsystems with no value this check-in. */
function strengthDecomposition(
  fc: { value: number } | null,
  fi: ConstructResult | null,
  pe: ConstructResult | null,
): DecompositionRow[] {
  const rows: DecompositionRow[] = [];
  if (fc) {
    const w = getWeight("functional_capacity", "strength_score");
    rows.push({ subsystem: "functional_capacity", weight: w, value: fc.value, contribution: w * (fc.value - 50) });
  }
  if (fi) {
    const w = getWeight("fatigue_index", "strength_score");
    rows.push({ subsystem: "fatigue_index", weight: w, value: fi.value, contribution: w * (fi.value - 50) });
  }
  if (pe) {
    const w = getWeight("phonation_efficiency", "strength_score");
    rows.push({ subsystem: "phonation_efficiency", weight: w, value: pe.value, contribution: w * (pe.value - 50) });
  }
  return rows;
}

/**
 * Runs the full pipeline for one check-in. Any construct whose required raw
 * features are missing (e.g. no pitch detected, or a client that didn't send
 * a feature at all) is simply omitted — the same "a rule doesn't fire
 * without its facts" behavior as the original Datalog engine — rather than
 * fabricating a value from partial data.
 */
export function scoreCheckIn(features: RawScoringFeatures): ScoringResult {
  const mii = muscleIntegrityIndex(features);
  const vsi = vocalStabilityIndex(features);
  const rsi = respiratorySupportIndex(features);
  const pe = phonationEfficiency(features);
  const mci = motorCoordinationIndex(features);
  const rs = resonanceStability(features);
  const fi = fatigueIndex(vsi, rsi);
  const fc = functionalCapacity(mii, rsi, mci);
  const decomposition = strengthDecomposition(fc, fi, pe);

  const constructs = [mii, vsi, rsi, pe, mci, rs, fi].filter((c): c is ConstructResult => c !== null);

  let strengthScore: { value: number; confidence: number } | null = null;
  if (decomposition.length > 0) {
    const total = decomposition.reduce((sum, d) => sum + d.contribution, 0);
    strengthScore = {
      value: clamp0to100(50 + total),
      confidence: confidenceFromSignalQuality(features.signalQuality),
    };
  }

  const frailty = [energyBasedFrailty(features), sarcopeniaBasedFrailty(features)].filter(
    (f): f is FrailtyAxisResult => f !== null,
  );

  return { constructs, functionalCapacity: fc, decomposition, strengthScore, frailty };
}
