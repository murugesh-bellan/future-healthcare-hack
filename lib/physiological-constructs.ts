// Derives named physiological constructs from a check-in's VoiceSignals.
//
// This mirrors the "Undertone Physiological Voice Engine" ontology being
// built in Prometheux — same six constructs, same feature -> construct
// mapping, same direction of effect — but runs live in this app, since
// Prometheux has no request-time API this app can call synchronously.
//
// Every weight here is an EQUAL-WEIGHTED, illustrative combination of the
// stated features in the stated direction — not a fitted or published
// coefficient (same disclosure standard as the Strength Score elsewhere in
// this app). `formula` is stored per-row precisely so this can be shown to
// the person it's about, not just asserted.

import type { VoiceSignals } from "./voice-signals";

export interface ConstructContributor {
  feature: string;
  direction: "+" | "-";
  rawValue: number | null;
  units: string;
}

export interface ConstructResult {
  name: string;
  /** 0-100. Higher = better/more stable for every construct here, including fatigue_index (100 = low fatigue). */
  value: number;
  formula: string;
  /** 0-1 — fraction of this construct's inputs that were actually available for this recording. */
  confidence: number;
  contributors: ConstructContributor[];
}

function normalize01(raw: number | null, min: number, max: number): number | null {
  if (raw === null || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, (raw - min) / (max - min)));
}

interface FeatureInput {
  feature: string;
  direction: "+" | "-";
  raw01: number | null;
  rawValue: number | null;
  units: string;
}

/** Equal-weighted signed combination — "-" direction features are inverted so higher output is always "better". */
function combine(name: string, inputs: FeatureInput[]): ConstructResult {
  const usable = inputs.filter((c) => c.raw01 !== null);
  const confidence = inputs.length > 0 ? usable.length / inputs.length : 0;
  const formula = `Equal-weighted average of ${inputs.map((c) => `${c.feature} (${c.direction})`).join(", ")} — illustrative, not a published coefficient.`;

  if (usable.length === 0) {
    return {
      name,
      value: 50,
      formula,
      confidence: 0,
      contributors: inputs.map(({ feature, direction, rawValue, units }) => ({ feature, direction, rawValue, units })),
    };
  }

  const goodnessValues = usable.map((c) => (c.direction === "+" ? c.raw01! : 1 - c.raw01!));
  const goodness = goodnessValues.reduce((a, b) => a + b, 0) / goodnessValues.length;

  return {
    name,
    value: Math.round(goodness * 100),
    formula,
    confidence,
    contributors: inputs.map(({ feature, direction, rawValue, units }) => ({ feature, direction, rawValue, units })),
  };
}

/** Fraction of the recording that was voiced speech rather than silence/pause. */
function voicedRatioOf(signals: VoiceSignals): number | null {
  if (signals.durationSeconds <= 0) return null;
  return signals.voicedSegmentDurationSeconds / signals.durationSeconds;
}

/** Coefficient of variation of F0 — pitch variability relative to its own mean, unitless. */
function f0CvOf(signals: VoiceSignals): number | null {
  if (signals.meanPitchHz === null || signals.meanPitchHz <= 0 || signals.pitchStdHz === null) return null;
  return signals.pitchStdHz / signals.meanPitchHz;
}

export function computePhysiologicalConstructs(signals: VoiceSignals): ConstructResult[] {
  const f0Cv = f0CvOf(signals);
  const voicedRatio = voicedRatioOf(signals);

  // Typical-range normalizations — illustrative, hand-picked for demo clarity,
  // same convention already used elsewhere in this app (see lib/trend-data.ts).
  const jitter: FeatureInput = { feature: "Jitter", direction: "-", raw01: normalize01(signals.jitterPercent, 0, 5), rawValue: signals.jitterPercent, units: "%" };
  const shimmer: FeatureInput = { feature: "Shimmer", direction: "-", raw01: normalize01(signals.shimmerPercent, 0, 20), rawValue: signals.shimmerPercent, units: "%" };
  const f0CvInput: FeatureInput = { feature: "Pitch variability (F0 CV)", direction: "-", raw01: normalize01(f0Cv, 0, 0.3), rawValue: f0Cv, units: "ratio" };
  const hnr: FeatureInput = { feature: "Harmonics-to-noise ratio", direction: "+", raw01: normalize01(signals.hnrDb, 0, 25), rawValue: signals.hnrDb, units: "dB" };
  const voicedRatioInput: FeatureInput = { feature: "Voiced ratio", direction: "+", raw01: normalize01(voicedRatio, 0, 1), rawValue: voicedRatio, units: "ratio" };
  const pauseRatio: FeatureInput = { feature: "Pause ratio", direction: "-", raw01: normalize01(signals.pauseRatio, 0, 0.55), rawValue: signals.pauseRatio, units: "ratio" };
  const energy: FeatureInput = { feature: "Loudness (RMS energy)", direction: "+", raw01: normalize01(signals.meanEnergyRms, 0, 0.15), rawValue: signals.meanEnergyRms, units: "rms" };
  const speechRate: FeatureInput = { feature: "Speech rate", direction: "+", raw01: normalize01(signals.speechRateWpm, 60, 220), rawValue: signals.speechRateWpm, units: "wpm" };
  const alphaRatio: FeatureInput = { feature: "Alpha ratio", direction: "+", raw01: normalize01(signals.alphaRatioDb, -10, 10), rawValue: signals.alphaRatioDb, units: "dB" };

  const vocalStability = combine("vocal_stability_index", [jitter, shimmer, f0CvInput]);
  const phonationEfficiency = combine("phonation_efficiency", [hnr, jitter, shimmer]);
  const respiratorySupport = combine("respiratory_support_index", [voicedRatioInput, pauseRatio, energy]);
  const motorCoordination = combine("motor_coordination_index", [speechRate, pauseRatio, jitter]);
  const resonanceStability = combine("resonance_stability", [alphaRatio, hnr]);

  // Fatigue is derived from two already-computed constructs, not raw features directly —
  // higher stability/support means lower fatigue, so this inverts their average.
  const fatigueInputsPresent = [vocalStability.confidence > 0, respiratorySupport.confidence > 0].filter(Boolean).length;
  const fatigueGoodness = 1 - (vocalStability.value / 100 + respiratorySupport.value / 100) / 2;
  const fatigueIndex: ConstructResult = {
    name: "fatigue_index",
    value: Math.round((1 - fatigueGoodness) * 100), // stored as "100 = low fatigue", consistent with every other construct
    formula: "Inverse of the average of vocal_stability_index and respiratory_support_index — higher stability/support means lower fatigue.",
    confidence: fatigueInputsPresent / 2,
    contributors: [
      { feature: "vocal_stability_index", direction: "-", rawValue: vocalStability.value, units: "score" },
      { feature: "respiratory_support_index", direction: "-", rawValue: respiratorySupport.value, units: "score" },
    ],
  };

  return [vocalStability, phonationEfficiency, respiratorySupport, motorCoordination, resonanceStability, fatigueIndex];
}

export const CONSTRUCT_DISPLAY_NAMES: Record<string, string> = {
  vocal_stability_index: "Vocal Stability",
  phonation_efficiency: "Phonation Efficiency",
  respiratory_support_index: "Respiratory Support",
  motor_coordination_index: "Motor Coordination",
  resonance_stability: "Resonance Stability",
  fatigue_index: "Fatigue",
};
