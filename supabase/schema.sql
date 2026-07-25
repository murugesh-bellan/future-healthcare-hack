-- ============================================================================
-- Speakers (patients) & medication catalogue
--
-- This file is a running migration, not a fresh-install-only snapshot: it is
-- meant to be re-applied against a database that already has the original
-- patients/check_ins/voice_signals tables from an earlier version of this
-- schema. Existing tables are widened with `alter table ... add column if
-- not exists` rather than redefined via `create table if not exists` (which
-- is a no-op — and therefore silently adds nothing — once the table already
-- exists). Policies are dropped and recreated so re-running this file is safe.
-- ============================================================================

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  whatsapp_user_id text unique,
  consented_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.patients add column if not exists age int;
alter table public.patients add column if not exists sex text;
alter table public.patients add column if not exists height_cm numeric;
alter table public.patients add column if not exists enrolled_date date;
alter table public.patients add column if not exists cohort text;

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  drug_class text,
  mechanism text,
  created_at timestamptz not null default now()
);

-- A speaker's GLP-1 (or other catalogued) treatment episode.
create table if not exists public.glp1_therapies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete restrict,
  start_date date not null,
  dose_mg numeric,
  titration_stage text,
  adherence numeric,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Recordings (check-ins) & capture conditions
-- ============================================================================

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  channel text not null check (channel in ('web', 'whatsapp')),
  transcript text not null,
  raw_audio_path text,
  created_at timestamptz not null default now()
);

alter table public.check_ins add column if not exists task_type text;
alter table public.check_ins add column if not exists sample_rate_hz int;
alter table public.check_ins add column if not exists device text;
alter table public.check_ins add column if not exists duration_s numeric;

-- Capture conditions affecting feature validity. One row per recording.
create table if not exists public.recording_contexts (
  check_in_id uuid primary key references public.check_ins(id) on delete cascade,
  snr_db numeric,
  background_noise text,
  microphone text,
  environment text,
  time_of_day text,
  signal_quality text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Acoustic layer — one row per eGeMAPS-style feature per recording (EAV),
-- so new feature types (MFCC, Formant, CPP, ...) don't require a migration.
-- ============================================================================

create table if not exists public.acoustic_biomarkers (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  feature_name text not null,
  raw_value numeric,
  units text,
  normalisation_method text,
  math_definition text,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists acoustic_biomarkers_check_in_id_idx on public.acoustic_biomarkers (check_in_id);
create index if not exists acoustic_biomarkers_feature_name_idx on public.acoustic_biomarkers (feature_name);

-- One-time transition from the old flat voice_signals table (superseded by
-- the acoustic_biomarkers EAV layer above): unpivot each row into one
-- acoustic_biomarkers row per non-null feature, then drop voice_signals.
-- Guarded so this is a no-op on every subsequent re-run of this file.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'voice_signals'
  ) then
    insert into public.acoustic_biomarkers (check_in_id, feature_name, raw_value, units)
    select check_in_id, 'F0', mean_pitch_hz, 'Hz' from public.voice_signals where mean_pitch_hz is not null
    union all
    select check_in_id, 'F0_std', pitch_std_hz, 'Hz' from public.voice_signals where pitch_std_hz is not null
    union all
    select check_in_id, 'Jitter', jitter_percent, '%' from public.voice_signals where jitter_percent is not null
    union all
    select check_in_id, 'Shimmer', shimmer_percent, '%' from public.voice_signals where shimmer_percent is not null
    union all
    select check_in_id, 'Loudness', mean_energy_rms, 'rms' from public.voice_signals where mean_energy_rms is not null
    union all
    select check_in_id, 'PauseRatio', pause_ratio, 'ratio' from public.voice_signals where pause_ratio is not null
    union all
    select check_in_id, 'SpeechRate', speech_rate_wpm, 'wpm' from public.voice_signals where speech_rate_wpm is not null
    union all
    select check_in_id, 'RecordingDuration', duration_seconds, 's' from public.voice_signals where duration_seconds is not null;

    drop table public.voice_signals cascade;
  end if;
end $$;

-- ============================================================================
-- Construct layer — respiratory / voice-quality / motor subtypes share an
-- identical shape, so they're one table with a `category` discriminator
-- rather than three near-duplicate tables.
-- ============================================================================

create table if not exists public.voice_constructs (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  category text not null check (category in ('respiratory', 'voice_quality', 'motor')),
  name text not null,
  value numeric,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists voice_constructs_check_in_id_idx on public.voice_constructs (check_in_id);

-- Derived latent variables (Vocal Stability, Respiratory Support, Phonation
-- Efficiency, Motor Coordination, Resonance Stability, Fatigue, Frailty, ...).
create table if not exists public.physiological_constructs (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  name text not null,
  value numeric,
  formula text,
  normalisation_method text,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists physiological_constructs_check_in_id_idx on public.physiological_constructs (check_in_id);

-- Functional-level roll-up of the physiological constructs.
create table if not exists public.functional_biomarkers (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  name text not null,
  value numeric,
  formula text,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists functional_biomarkers_check_in_id_idx on public.functional_biomarkers (check_in_id);

-- Clinical frailty axes (JMIR 2024 logistic-regression study, citation EV001 in
-- clinical_evidence.csv): each axis's own cited coefficient times its measured
-- feature — see lib/scoring.ts's FrailtyAxisResult doc comment for why this is
-- NOT a full model log-odds (no intercept/other covariates available), and why
-- there is deliberately no derived likelihood/probability column.
create table if not exists public.frailty_assessments (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  axis text not null check (axis in ('energy_based_frailty', 'sarcopenia_based_frailty')),
  confidence numeric not null,
  created_at timestamptz not null default now()
);

-- Renamed from the original log_odds/likelihood columns: log_odds overclaimed
-- completeness it didn't have, and likelihood compounded that into a fabricated
-- probability. coefficient_contribution is the honest name for what's actually stored.
alter table public.frailty_assessments add column if not exists coefficient_contribution numeric;

-- Backfill from the old column before dropping it, so deployments that already
-- ran the previous version of this migration don't lose their stored history.
-- Guarded on the column still existing so re-running this file after the drop
-- (below) has already happened is a no-op rather than an error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'frailty_assessments' and column_name = 'log_odds'
  ) then
    update public.frailty_assessments set coefficient_contribution = log_odds where coefficient_contribution is null;
  end if;
end $$;

alter table public.frailty_assessments drop column if exists log_odds;
alter table public.frailty_assessments drop column if exists likelihood;

create index if not exists frailty_assessments_check_in_id_idx on public.frailty_assessments (check_in_id);

-- ============================================================================
-- Scoring & explainability
-- ============================================================================

create table if not exists public.strength_scores (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  value numeric not null check (value >= 0 and value <= 100),
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists strength_scores_patient_id_idx on public.strength_scores (patient_id);

-- How each subsystem contributed to a score.
create table if not exists public.score_decompositions (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.strength_scores(id) on delete cascade,
  subsystem text not null,
  contribution numeric,
  weight numeric,
  created_at timestamptz not null default now()
);

create index if not exists score_decompositions_score_id_idx on public.score_decompositions (score_id);

-- ============================================================================
-- Longitudinal baselines & drift — the within-person change signal.
-- One current baseline row per (patient, construct); recomputed in place.
-- ============================================================================

create table if not exists public.longitudinal_baselines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  construct_name text not null,
  rolling_mean numeric,
  rolling_variance numeric,
  window_days int,
  ci_low numeric,
  ci_high numeric,
  updated_at timestamptz not null default now(),
  unique (patient_id, construct_name)
);

-- Mean absolute deviation (not variance/stddev — the .vada engine has no runtime sqrt) plus
-- history bounds, matching strength_baseline's actual (Mean, MAD, Count, FirstTs, LastTs) output.
alter table public.longitudinal_baselines add column if not exists mad numeric;
alter table public.longitudinal_baselines add column if not exists check_in_count int;
alter table public.longitudinal_baselines add column if not exists first_check_in_at timestamptz;
alter table public.longitudinal_baselines add column if not exists last_check_in_at timestamptz;

create table if not exists public.baseline_drifts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  construct_name text not null,
  z_score numeric,
  trend_slope numeric,
  deterioration_rate numeric,
  recovery_velocity numeric,
  change_point_detected boolean not null default false,
  created_at timestamptz not null default now()
);

-- Categorical trend read (deteriorating/recovering/stable) and the largest single-step drop,
-- matching strength_longitudinal's actual (Direction, MaxDrop) output.
alter table public.baseline_drifts add column if not exists direction text;
alter table public.baseline_drifts add column if not exists max_drop numeric;

create index if not exists baseline_drifts_patient_construct_idx on public.baseline_drifts (patient_id, construct_name);

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.patients enable row level security;
alter table public.medications enable row level security;
alter table public.glp1_therapies enable row level security;
alter table public.check_ins enable row level security;
alter table public.recording_contexts enable row level security;
alter table public.acoustic_biomarkers enable row level security;
alter table public.voice_constructs enable row level security;
alter table public.physiological_constructs enable row level security;
alter table public.functional_biomarkers enable row level security;
alter table public.frailty_assessments enable row level security;
alter table public.strength_scores enable row level security;
alter table public.score_decompositions enable row level security;
alter table public.longitudinal_baselines enable row level security;
alter table public.baseline_drifts enable row level security;

drop policy if exists "Patients can read their own profile" on public.patients;
create policy "Patients can read their own profile"
on public.patients for select
using (auth.uid() = auth_user_id);

-- Medications are a shared, non-PII catalogue: any signed-in user can read it.
drop policy if exists "Authenticated users can read the medication catalogue" on public.medications;
create policy "Authenticated users can read the medication catalogue"
on public.medications for select
to authenticated
using (true);

drop policy if exists "Patients can read their own therapies" on public.glp1_therapies;
create policy "Patients can read their own therapies"
on public.glp1_therapies for select
using (exists (
  select 1 from public.patients
  where patients.id = glp1_therapies.patient_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own check-ins" on public.check_ins;
create policy "Patients can read their own check-ins"
on public.check_ins for select
using (exists (
  select 1 from public.patients
  where patients.id = check_ins.patient_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own recording contexts" on public.recording_contexts;
create policy "Patients can read their own recording contexts"
on public.recording_contexts for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = recording_contexts.check_in_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own acoustic biomarkers" on public.acoustic_biomarkers;
create policy "Patients can read their own acoustic biomarkers"
on public.acoustic_biomarkers for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = acoustic_biomarkers.check_in_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own voice constructs" on public.voice_constructs;
create policy "Patients can read their own voice constructs"
on public.voice_constructs for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = voice_constructs.check_in_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own physiological constructs" on public.physiological_constructs;
create policy "Patients can read their own physiological constructs"
on public.physiological_constructs for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = physiological_constructs.check_in_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own functional biomarkers" on public.functional_biomarkers;
create policy "Patients can read their own functional biomarkers"
on public.functional_biomarkers for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = functional_biomarkers.check_in_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own frailty assessments" on public.frailty_assessments;
create policy "Patients can read their own frailty assessments"
on public.frailty_assessments for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = frailty_assessments.check_in_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own strength scores" on public.strength_scores;
create policy "Patients can read their own strength scores"
on public.strength_scores for select
using (exists (
  select 1 from public.patients
  where patients.id = strength_scores.patient_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own score decompositions" on public.score_decompositions;
create policy "Patients can read their own score decompositions"
on public.score_decompositions for select
using (exists (
  select 1 from public.strength_scores
  join public.patients on patients.id = strength_scores.patient_id
  where strength_scores.id = score_decompositions.score_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own longitudinal baselines" on public.longitudinal_baselines;
create policy "Patients can read their own longitudinal baselines"
on public.longitudinal_baselines for select
using (exists (
  select 1 from public.patients
  where patients.id = longitudinal_baselines.patient_id and patients.auth_user_id = auth.uid()
));

drop policy if exists "Patients can read their own baseline drift" on public.baseline_drifts;
create policy "Patients can read their own baseline drift"
on public.baseline_drifts for select
using (exists (
  select 1 from public.patients
  where patients.id = baseline_drifts.patient_id and patients.auth_user_id = auth.uid()
));
