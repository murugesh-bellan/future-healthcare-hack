// Row shapes for supabase/schema.sql. Not wired into the Supabase client's generic —
// the installed @supabase/supabase-js version resolves awaited/destructured query
// results to `never` when given a custom Database generic (reproduced in isolation).
// Cast query results to these types at call sites instead.

export interface PatientRow {
  id: string;
  auth_user_id: string | null;
  whatsapp_user_id: string | null;
  consented_at: string | null;
  created_at: string;
}

export interface CheckInRow {
  id: string;
  patient_id: string;
  channel: "web" | "whatsapp";
  transcript: string;
  raw_audio_path: string | null;
  created_at: string;
}

export interface VoiceSignalRow {
  id: string;
  check_in_id: string;
  mean_pitch_hz: number | null;
  pitch_std_hz: number | null;
  jitter_percent: number | null;
  shimmer_percent: number | null;
  mean_energy_rms: number | null;
  pause_ratio: number | null;
  speech_rate_wpm: number | null;
  duration_seconds: number | null;
  created_at: string;
}
