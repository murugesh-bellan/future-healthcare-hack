// Row shapes for supabase/schema.sql. Not wired into the Supabase client's generic —
// the installed @supabase/supabase-js version resolves awaited/destructured query
// results to `never` when given a custom Database generic (reproduced in isolation).
// Cast query results to these types at call sites instead.

export interface PatientRow {
  id: string;
  auth_user_id: string | null;
  consented_at: string | null;
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  enrolled_date: string | null;
  cohort: string | null;
  created_at: string;
}

export interface MedicationRow {
  id: string;
  name: string;
  drug_class: string | null;
  mechanism: string | null;
  created_at: string;
}

export interface Glp1TherapyRow {
  id: string;
  patient_id: string;
  medication_id: string;
  start_date: string;
  dose_mg: number | null;
  titration_stage: string | null;
  adherence: number | null;
  created_at: string;
}

export interface CheckInRow {
  id: string;
  patient_id: string;
  channel: "web";
  transcript: string;
  raw_audio_path: string | null;
  task_type: string | null;
  sample_rate_hz: number | null;
  device: string | null;
  duration_s: number | null;
  created_at: string;
}

export interface RecordingContextRow {
  check_in_id: string;
  snr_db: number | null;
  background_noise: string | null;
  microphone: string | null;
  environment: string | null;
  time_of_day: string | null;
  signal_quality: string | null;
  created_at: string;
}

export interface AcousticBiomarkerRow {
  id: string;
  check_in_id: string;
  feature_name: string;
  raw_value: number | null;
  units: string | null;
  normalisation_method: string | null;
  math_definition: string | null;
  confidence: number | null;
  created_at: string;
}

export type VoiceConstructCategory = "respiratory" | "voice_quality" | "motor";

export interface VoiceConstructRow {
  id: string;
  check_in_id: string;
  category: VoiceConstructCategory;
  name: string;
  value: number | null;
  confidence: number | null;
  created_at: string;
}

export interface PhysiologicalConstructRow {
  id: string;
  check_in_id: string;
  name: string;
  value: number | null;
  formula: string | null;
  normalisation_method: string | null;
  confidence: number | null;
  created_at: string;
}

export interface FunctionalBiomarkerRow {
  id: string;
  check_in_id: string;
  name: string;
  value: number | null;
  formula: string | null;
  confidence: number | null;
  created_at: string;
}

export type FrailtyAxis = "energy_based_frailty" | "sarcopenia_based_frailty";

export interface FrailtyAssessmentRow {
  id: string;
  check_in_id: string;
  axis: FrailtyAxis;
  /** Cited coefficient × measured feature only — not a complete model log-odds. See lib/scoring.ts's FrailtyAxisResult doc comment. */
  coefficient_contribution: number;
  confidence: number;
  created_at: string;
}

export interface StrengthScoreRow {
  id: string;
  check_in_id: string;
  patient_id: string;
  value: number;
  confidence: number | null;
  created_at: string;
}

export interface ScoreDecompositionRow {
  id: string;
  score_id: string;
  subsystem: string;
  contribution: number | null;
  weight: number | null;
  created_at: string;
}

export interface LongitudinalBaselineRow {
  id: string;
  patient_id: string;
  construct_name: string;
  rolling_mean: number | null;
  rolling_variance: number | null;
  window_days: number | null;
  ci_low: number | null;
  ci_high: number | null;
  mad: number | null;
  check_in_count: number | null;
  first_check_in_at: string | null;
  last_check_in_at: string | null;
  updated_at: string;
}

export type BaselineDriftDirection = "deteriorating" | "recovering" | "stable";

export interface BaselineDriftRow {
  id: string;
  patient_id: string;
  construct_name: string;
  z_score: number | null;
  trend_slope: number | null;
  deterioration_rate: number | null;
  recovery_velocity: number | null;
  direction: BaselineDriftDirection | null;
  max_drop: number | null;
  change_point_detected: boolean;
  created_at: string;
}
