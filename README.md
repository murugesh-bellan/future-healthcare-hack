# Undertone

Voice-first chronic-care check-ins through a WebApp and WhatsApp.

## Stack

- Next.js + Tailwind CSS v4 on Vercel for the WebApp and API routes
- Eve + Vercel AI Gateway for the durable shared agent
- Vercel Chat SDK WhatsApp adapter for WhatsApp webhooks
- Supabase Auth (anonymous sign-in), Postgres, and row-level security
- ElevenLabs for transcription and synthesized voice replies

## Start locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The health endpoint is available at `/api/health`.

Before it works end to end you need:

1. `supabase/schema.sql` applied to a Supabase project.
2. The env vars in `.env.example` filled in (Supabase URL/anon key/service role key, `AI_GATEWAY_API_KEY`, ElevenLabs key + voice id), copied into `.env.local`.
3. Pick your own `DEMO_ACCESS_CODE` and two `DEMO_PATIENT_{A,B}_{EMAIL,PASSWORD}` pairs, then run `node scripts/seed-demo-patients.mjs` to create (or rotate) those two Supabase accounts. The web app gates on a fixed two-persona picker (`components/AnonAuthProvider.tsx` → `/api/demo-login`) rather than open anonymous sign-in — see "How identity and consent work" below.

## Structure

- `app/` — WebApp pages (home, check-in, trends, coaching, evidence, how-it-works) and API routes
- `agent/` — Eve agent, typed tools (`save_check_in`, `confirm_consent`), and the eve/WhatsApp channels
- `lib/` — Supabase clients (browser, server, admin), ElevenLabs, and patient resolution
- `components/` — shared TopBar/BottomNav and the demo-persona auth bootstrap
- `design/` — source design mockups the pages were built from
- `supabase/schema.sql` — data model and row-level security

## How identity and consent work

- The web app is currently gated behind two fixed demo personas rather than open anonymous sign-in: `components/AnonAuthProvider.tsx` shows a picker behind a shared `DEMO_ACCESS_CODE`, and `/api/demo-login` performs the actual `signInWithPassword` server-side (credentials in `lib/demo-personas.ts`, sourced from env vars — never sent to the browser). The resulting session lives in cookies so both the browser and server see the same user, same as anonymous sign-in did before.
- `agent/channels/eve.ts` verifies that Supabase session on every eve request and attaches it as the caller's principal — the model never receives or chooses a patient id.
- `lib/patients.ts` resolves (and lazily creates) the `patients` row for that principal: by `auth_user_id` for web/Supabase callers, by `whatsapp_user_id` for WhatsApp callers.
- The `confirm_consent` and `save_check_in` tools both derive the patient from `ctx.session.auth.current` — `save_check_in` refuses to write until consent is on record. The check-in page shows an explicit consent step before the mic is enabled; WhatsApp gets consent conversationally per `agent/instructions.md`.
- All writes go through the service-role client (`lib/supabase-admin.ts`) from trusted server code only, after identity is verified above. Reads (trends, home) use the cookie-bound, RLS-scoped client (`lib/supabase-server.ts`).

## Safety baseline

This project is a prototype. The agent must not diagnose or make treatment decisions. Use synthetic data for development and obtain explicit consent before retaining any voice recording. The "Strength Score" shown in the UI is a lightweight, illustrative metric derived from check-in frequency — it is not a validated biometric.

## WhatsApp setup

The channel lives at `agent/channels/whatsapp.ts`, so Eve exposes its webhook automatically. To go live:

1. Configure a WhatsApp Business app and add `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET` as Vercel environment variables.
2. Point the app's webhook at the deployed Eve-generated WhatsApp route.
3. The channel currently uses in-memory thread state (`@chat-adapter/state-memory`), which is fine for a demo but resets on redeploy/restart — swap in a durable Chat SDK state adapter before relying on it for real conversations at scale.




Structure:

Ontology.json
{
  "nodes": [
    {"id": "speaker", "label": "Speaker", "fields": {"speaker_id": "string"}},
    {"id": "voiceCheckIn", "label": "VoiceCheckIn", "fields": {"checkin_id": "string", "timestamp": "date", "signal_quality": "string"}},
    {"id": "acousticFeature", "label": "AcousticFeature", "fields": {"jitter": "double", "shimmer": "double", "hnr": "double", "zero_crossing_rate": "double"}},
    {"id": "physiologicalIndex", "label": "PhysiologicalIndex", "fields": {"name": "string", "index_value": "double", "confidence": "double"}},
    {"id": "functionalCapacity", "label": "FunctionalCapacity", "fields": {"index_value": "double"}},
    {"id": "strengthScore", "label": "StrengthScore", "fields": {"score": "double", "confidence": "double"}},
    {"id": "strengthComponent", "label": "StrengthComponent", "fields": {"subsystem": "string", "weight": "double", "contribution": "double"}},
    {"id": "longitudinalTrend", "label": "LongitudinalTrend", "fields": {"slope": "double", "direction": "string", "max_drop": "double", "change_point": "string", "baseline_mean": "double", "mad": "double"}},
    {"id": "contributionWeight", "label": "ContributionWeight", "fields": {"source_feature": "string", "target_construct": "string", "weight": "double", "citation_id": "string"}},
    {"id": "clinicalEvidence", "label": "ClinicalEvidence", "fields": {"citation_id": "string", "source": "string", "finding": "string", "url": "string"}}
  ],
  "edges": [
    {"from": "speaker", "to": "voiceCheckIn", "label": "HAS_CHECKIN"},
    {"from": "voiceCheckIn", "to": "acousticFeature", "label": "YIELDS_FEATURES"},
    {"from": "acousticFeature", "to": "physiologicalIndex", "label": "CONTRIBUTES_TO"},
    {"from": "physiologicalIndex", "to": "functionalCapacity", "label": "AGGREGATES_INTO"},
    {"from": "functionalCapacity", "to": "strengthScore", "label": "DRIVES"},
    {"from": "physiologicalIndex", "to": "strengthScore", "label": "DRIVES"},
    {"from": "strengthScore", "to": "strengthComponent", "label": "DECOMPOSES_INTO"},
    {"from": "strengthScore", "to": "longitudinalTrend", "label": "TRACKED_BY"},
    {"from": "contributionWeight", "to": "physiologicalIndex", "label": "WEIGHTS"},
    {"from": "contributionWeight", "to": "clinicalEvidence", "label": "CITES"}
  ]
}

dataflow.md (mermaid)
graph TD
  %% Data sources
  VF[(voice_feature.csv)]
  CW[(contribution_weight.csv)]
  CE[(clinical_evidence.csv)]

  %% Physiological indices
  VF --> MII[muscle_integrity_index]
  VF --> VSI[vocal_stability_index]
  VF --> RSI[respiratory_support_index]
  VF --> PE[phonation_efficiency]
  VF --> MCI[motor_coordination_index]
  VF --> RS[resonance_stability]
  CW -. weights .-> MII & VSI & RSI & PE & MCI & RS
  CE -. cites .-> CW

  %% Fatigue depends on two indices
  VSI --> FI[fatigue_index]
  RSI --> FI

  %% Functional capacity
  MII --> FC[functionalCapacity]
  RSI --> FC
  MCI --> FC

  %% Strength decomposition + score
  FC --> SC[strengthComponent]
  FI --> SC
  PE --> SC
  SC --> SS[strengthScore]

  %% Longitudinal layer
  SS --> SB[strength_baseline]
  SB --> SL[strength_longitudinal]
  SS --> SL

lineage_manifest.json (each concept → inputs, output, purpose)
{
  "project_id": "21d0b27cd16",
  "project_name": "Undertone Physiological Voice Engine",
  "datasources": ["voice_feature.csv", "contribution_weight.csv", "clinical_evidence.csv"],
  "concepts": [
    {"name": "muscle_integrity_index",   "inputs": ["voice_feature_csv", "contribution_weight_csv"], "output": "muscle_integrity_index",   "rows": 20},
    {"name": "vocal_stability_index",    "inputs": ["voice_feature_csv", "contribution_weight_csv"], "output": "vocal_stability_index",    "rows": 20},
    {"name": "respiratory_support_index","inputs": ["voice_feature_csv", "contribution_weight_csv"], "output": "respiratory_support_index","rows": 20},
    {"name": "phonation_efficiency",     "inputs": ["voice_feature_csv", "contribution_weight_csv"], "output": "phonation_efficiency",     "rows": 20},
    {"name": "motor_coordination_index", "inputs": ["voice_feature_csv", "contribution_weight_csv"], "output": "motor_coordination_index", "rows": 20},
    {"name": "resonance_stability",      "inputs": ["voice_feature_csv", "contribution_weight_csv"], "output": "resonance_stability",      "rows": 20},
    {"name": "fatigue_index",            "inputs": ["vocal_stability_index", "respiratory_support_index", "contribution_weight_csv"], "output": "fatigue_index", "rows": 20},
    {"name": "functionalCapacity",       "inputs": ["muscle_integrity_index", "respiratory_support_index", "motor_coordination_index", "contribution_weight_csv"], "output": "functionalCapacity", "rows": 20},
    {"name": "strengthComponent",        "inputs": ["functionalCapacity", "fatigue_index", "phonation_efficiency", "contribution_weight_csv"], "output": "strengthComponent", "rows": 60},
    {"name": "strengthScore",            "inputs": ["strengthComponent", "voice_feature_csv"], "output": "strengthScore", "rows": 20},
    {"name": "strength_baseline",        "inputs": ["strengthScore"], "output": "strength_baseline", "rows": 4},
    {"name": "strength_longitudinal",    "inputs": ["strengthScore", "strength_baseline"], "output": "strength_longitudinal", "rows": 4}
  ]
}

undertone_concepts.vl (all Vadalog source, concatenated)
% ============================================================
% muscle_integrity_index
% ============================================================
@output("muscle_integrity_index").
w_zcr_mii(W) :- contribution_weight_csv("zero_crossing_rate","muscle_integrity_index",W,_,_).
w_shimmer_mii(W) :- contribution_weight_csv("shimmer","muscle_integrity_index",W,_,_).
mii_logodds(Checkin, Speaker, Ts, LogOdds) :-
    voice_feature_csv(Checkin, Speaker, Ts, _, Zcr, _, _, _, Shimmer, _, _, _, _, _, _, _),
    w_zcr_mii(Wz), w_shimmer_mii(Ws),
    LogOdds = (0 - Wz) * (Zcr * 100) + (0 - Ws) * (Shimmer * 100).
mii_raw(Checkin, Speaker, Ts, Raw) :- mii_logodds(Checkin, Speaker, Ts, LogOdds), Raw = 50.0 + 50.0 * LogOdds.
mii_index(Checkin, Speaker, Ts, 0.0)   :- mii_raw(Checkin, Speaker, Ts, Raw), Raw < 0.0.
mii_index(Checkin, Speaker, Ts, 100.0) :- mii_raw(Checkin, Speaker, Ts, Raw), Raw > 100.0.
mii_index(Checkin, Speaker, Ts, Raw)   :- mii_raw(Checkin, Speaker, Ts, Raw), Raw >= 0.0, Raw <= 100.0.
mii_conf(Checkin, 0.9) :- voice_feature_csv(Checkin,_,_,_,_,_,_,_,_,_,_,_,_,_,_,"high").
mii_conf(Checkin, 0.7) :- voice_feature_csv(Checkin,_,_,_,_,_,_,_,_,_,_,_,_,_,_,"medium").
mii_conf(Checkin, 0.5) :- voice_feature_csv(Checkin,_,_,_,_,_,_,_,_,_,_,_,_,_,_,"low").
muscle_integrity_index(Checkin, Speaker, Ts, IndexValue, Confidence) :-
    mii_index(Checkin, Speaker, Ts, IndexValue), mii_conf(Checkin, Confidence).

% ============================================================
% strength_baseline
% ============================================================
@output("strength_baseline").
mean_ss(Speaker, M) :- strengthScore(_, Speaker, _, Score, _), M = mavg(Score).
absdev(Speaker, AD) :- strengthScore(_, Speaker, _, Score, _), mean_ss(Speaker, M), Score >= M, AD = Score - M.
absdev(Speaker, AD) :- strengthScore(_, Speaker, _, Score, _), mean_ss(Speaker, M), Score < M, AD = M - Score.
mad_ss(Speaker, MAD) :- absdev(Speaker, AD), MAD = mavg(AD).
cnt_ss(Speaker, C)   :- strengthScore(_, Speaker, _, _, _), C = mcount(1).
first_dt(Speaker, D) :- strengthScore(_, Speaker, Ts, _, _), D = mmin(Ts).
last_dt(Speaker, D)  :- strengthScore(_, Speaker, Ts, _, _), D = mmax(Ts).
strength_baseline(Speaker, Mean, Mad, Count, FirstTs, LastTs) :-
    mean_ss(Speaker, Mean), mad_ss(Speaker, Mad), cnt_ss(Speaker, Count),
    first_dt(Speaker, FirstTs), last_dt(Speaker, LastTs).

% ============================================================
% strength_longitudinal
% ============================================================
@output("strength_longitudinal").
first_val(Speaker, V) :- strength_baseline(Speaker,_,_,_,FirstTs,_), strengthScore(_, Speaker, FirstTs, V, _).
last_val(Speaker, V)  :- strength_baseline(Speaker,_,_,_,_,LastTs), strengthScore(_, Speaker, LastTs, V, _).
span_days(Speaker, Days) :- strength_baseline(Speaker,_,_,_,FirstTs,LastTs), Days = date:diff(LastTs, FirstTs).
slope(Speaker, Slope) :- first_val(Speaker, F), last_val(Speaker, L), span_days(Speaker, Days), Days > 0, Slope = (L - F) / Days.
slope(Speaker, 0.0) :- span_days(Speaker, Days), Days <= 0.
prev_ts(Speaker, Ts, PTs) :- strengthScore(_, Speaker, Ts, _, _), strengthScore(_, Speaker, T2, _, _), T2 < Ts, PTs = mmax(T2).
step_delta(Speaker, Ts, Delta) :- prev_ts(Speaker, Ts, PTs), strengthScore(_, Speaker, Ts, Cur, _), strengthScore(_, Speaker, PTs, Prev, _), Delta = Cur - Prev.
max_drop(Speaker, Drop) :- step_delta(Speaker, _, Delta), Drop = mmin(Delta).
direction(Speaker, "deteriorating") :- slope(Speaker, S), S < -0.3.
direction(Speaker, "recovering")    :- slope(Speaker, S), S > 0.3.
direction(Speaker, "stable")        :- slope(Speaker, S), S >= -0.3, S <= 0.3.
changepoint(Speaker, "yes") :- max_drop(Speaker, Drop), Drop < -20.0.
changepoint(Speaker, "no")  :- max_drop(Speaker, Drop), Drop >= -20.0.
strength_longitudinal(Speaker, First, Last, Slope, Direction, MaxDrop, ChangePoint, Mean, Mad) :-
    first_val(Speaker, First), last_val(Speaker, Last), slope(Speaker, Slope),
    direction(Speaker, Direction), max_drop(Speaker, MaxDrop),
    changepoint(Speaker, ChangePoint), strength_baseline(Speaker, Mean, Mad, _, _, _).


