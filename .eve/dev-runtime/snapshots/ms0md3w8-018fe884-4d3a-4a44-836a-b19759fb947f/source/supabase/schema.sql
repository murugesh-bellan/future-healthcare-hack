create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  whatsapp_user_id text unique,
  consented_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  channel text not null check (channel in ('web', 'whatsapp')),
  transcript text not null,
  raw_audio_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_signals (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  mean_pitch_hz numeric,
  pitch_std_hz numeric,
  jitter_percent numeric,
  shimmer_percent numeric,
  mean_energy_rms numeric,
  pause_ratio numeric,
  speech_rate_wpm numeric,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

alter table public.patients enable row level security;
alter table public.check_ins enable row level security;
alter table public.voice_signals enable row level security;

create policy "Patients can read their own profile"
on public.patients for select
using (auth.uid() = auth_user_id);

create policy "Patients can read their own check-ins"
on public.check_ins for select
using (exists (
  select 1 from public.patients
  where patients.id = check_ins.patient_id and patients.auth_user_id = auth.uid()
));

create policy "Patients can read their own voice signals"
on public.voice_signals for select
using (exists (
  select 1 from public.check_ins
  join public.patients on patients.id = check_ins.patient_id
  where check_ins.id = voice_signals.check_in_id and patients.auth_user_id = auth.uid()
));
