// Human-readable labels for the physiological_constructs rows written by
// lib/scoring.ts (the "Undertone Physiological Voice Engine" pipeline: raw
// acoustic features -> 6 constructs + fatigue_index -> functional capacity ->
// strength score). This file used to also compute the constructs itself via
// an independent, equal-weighted approximation, but that duplicated
// lib/scoring.ts's CSV-weighted implementation against the same table under
// the same construct names — this is now just the shared name -> label map
// both app/check-in/page.tsx and lib/trend-data.ts render against.
export const CONSTRUCT_DISPLAY_NAMES: Record<string, string> = {
  muscle_integrity_index: "Muscle Integrity",
  vocal_stability_index: "Vocal Stability",
  phonation_efficiency: "Phonation Efficiency",
  respiratory_support_index: "Respiratory Support",
  motor_coordination_index: "Motor Coordination",
  resonance_stability: "Resonance Stability",
  // Unlike every other construct here, higher is NOT better: lib/scoring.ts's
  // fatigue_index rises as vocal_stability_index/respiratory_support_index
  // fall, so higher = more fatigued (the standard reading of the word).
  fatigue_index: "Fatigue",
};
