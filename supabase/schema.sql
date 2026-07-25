-- ============================================================================
-- Speakers (patients) & medication catalogue
-- ============================================================================

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  whatsapp_user_id text unique,
  consented_at timestamptz,
  age int,
  sex text,
  height_cm numeric,
  enrolled_date date,
  cohort text,
  created_at timestamptz not null default now()
);

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
  task_type text,
  sample_rate_hz int,
  device text,
  duration_s numeric,
  created_at timestamptz not null default now()
);

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
alter table public.strength_scores enable row level security;
alter table public.score_decompositions enable row level security;
alter table public.longitudinal_baselines enable row level security;
alter table public.baseline_drifts enable row level security;

create policy "Patients can read their own profile"
on public.patients for select
using (auth.uid() = auth_user_id);

-- Medications are a shared, non-PII catalogue: any signed-in user can read it.
create policy "Authenticated users can read the medication catalogue"
on public.medications for select
to authenticated
using (true);

create policy "Patients can read their own therapies"
on public.glp1_therapies for select
using (exists (
  select 1 from public.patients
  where patients.id = glp1_therapies.patient_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own check-ins"
on public.check_ins for select
using (exists (
  select 1 from public.patients
  where patients.id = check_ins.patient_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own recording contexts"
on public.recording_contexts for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = recording_contexts.check_in_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own acoustic biomarkers"
on public.acoustic_biomarkers for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = acoustic_biomarkers.check_in_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own voice constructs"
on public.voice_constructs for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = voice_constructs.check_in_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own physiological constructs"
on public.physiological_constructs for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = physiological_constructs.check_in_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own functional biomarkers"
on public.functional_biomarkers for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = functional_biomarkers.check_in_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own strength scores"
on public.strength_scores for select
using (exists (
  select 1 from public.patients
  where patients.id = strength_scores.patient_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own score decompositions"
on public.score_decompositions for select
using (exists (
  select 1 from public.strength_scores
  join public.patients on patients.id = strength_scores.patient_id
  where strength_scores.id = score_decompositions.score_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own longitudinal baselines"
on public.longitudinal_baselines for select
using (exists (
  select 1 from public.patients
  where patients.id = longitudinal_baselines.patient_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own baseline drift"
on public.baseline_drifts for select
using (exists (
  select 1 from public.patients
  where patients.id = baseline_drifts.patient_id and patients.auth_user_id = auth.uid()
));
