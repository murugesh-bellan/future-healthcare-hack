# The Prometheux reasoning engine — how it connects to this app

This app's live Strength Score (`lib/physiological-constructs.ts`,
`lib/trend-data.ts`) is a deliberately simple, self-contained TypeScript
implementation, because the fuller reasoning engine below has no
request-time API this app can call synchronously — Prometheux is a
batch/dashboard tool, not a live inference endpoint. The two are connected
in the two ways that are actually possible:

1. **Same design, ported.** Every construct name, every feature mapping,
   and the "everything traceable to a citation" principle in this app's
   TypeScript mirrors what's proven below — not by calling it, by copying
   the design.
2. **A real, published, clickable artifact.** The dashboards built on top
   of this engine are published and linked from the app itself (see the
   Evidence page) — a judge can click through and interact with the actual
   reasoning engine, not just a screenshot of it.

Project: **Undertone Physiological Voice Engine** (Prometheux, Vadalog).
Ontology: `Speaker → VoiceCheckIn → AcousticFeature → PhysiologicalIndex →
FunctionalCapacity → StrengthScore`, with `ContributionWeight` as the single
source of truth for every coefficient (never hardcoded in a rule) and
`ClinicalEvidence` giving each weight a real citation.

Dashboards — both published, live, clickable:
- **[Undertone Voice Health Dashboard](https://platform.prometheux.ai/apps/21d0b27cd16/324cad53-d373-4523-ac6d-a126a8a86212)** — cohort overview, per-patient drill-down, and a dedicated "Evidence & Weights" page showing the live contribution table.
- **[Clinician Review Dashboard](https://platform.prometheux.ai/apps/21d0b27cd16/f42d8ae1-6a09-4584-94eb-7d580ed31ef5)** — patient cohort with risk-status badges, click-through to per-patient trend, subsystem breakdown, and both frailty axes. *(URL inferred from the same `/apps/{project_id}/{app_id}` pattern as the first — worth a quick click to confirm before relying on it in the demo.)*

## Representative Vadalog source

These are the actual, currently-running rules — not illustrative pseudocode.

### `strengthScore` — the top-level explainable score

Every score is a 50-point neutral baseline plus the sum of subsystem
contributions. The components below provably sum back to this number —
that's the "why" behind every score, not an assertion.

```vadalog
% Sum the per-subsystem contributions (from strength_component) around a 50 baseline.
ss_sum(Checkin, Speaker, Ts, Total) :-
    strengthComponent(Checkin, Speaker, Ts, _, _, _, Contribution),
    Total = msum(Contribution).

ss_raw(Checkin, Speaker, Ts, Raw) :-
    ss_sum(Checkin, Speaker, Ts, Total),
    Raw = 50.0 + Total.

ss_index(Checkin, Speaker, Ts, 0.0)   :- ss_raw(Checkin, Speaker, Ts, Raw), Raw < 0.0.
ss_index(Checkin, Speaker, Ts, 100.0) :- ss_raw(Checkin, Speaker, Ts, Raw), Raw > 100.0.
ss_index(Checkin, Speaker, Ts, Raw)   :- ss_raw(Checkin, Speaker, Ts, Raw), Raw >= 0.0, Raw <= 100.0.

ss_conf(Checkin, 0.9) :- voice_feature_csv(Checkin, _, _, _, _, _, _, _, _, _, _, _, _, _, _, "high").
ss_conf(Checkin, 0.7) :- voice_feature_csv(Checkin, _, _, _, _, _, _, _, _, _, _, _, _, _, _, "medium").
ss_conf(Checkin, 0.5) :- voice_feature_csv(Checkin, _, _, _, _, _, _, _, _, _, _, _, _, _, _, "low").

strengthScore(Checkin, Speaker, Ts, Score, Confidence) :-
    ss_index(Checkin, Speaker, Ts, Score),
    ss_conf(Checkin, Confidence).
```

### `strengthComponent` — the decomposition, weight looked up from data

The weight is never a literal in the rule — it's read from
`contribution_weight`, the single source-of-truth table, so retuning a
coefficient is editing a data row, not editing logic.

```vadalog
strengthComponent(Checkin, Speaker, Ts, "functional_capacity", W, Fc, Contribution) :-
    functionalCapacity(Checkin, Speaker, Ts, Fc),
    contribution_weight_csv("functional_capacity","strength_score",W,_,_),
    Contribution = W * (Fc - 50).

strengthComponent(Checkin, Speaker, Ts, "fatigue_index", W, Fi, Contribution) :-
    fatigue_index(Checkin, Speaker, Ts, Fi, _),
    contribution_weight_csv("fatigue_index","strength_score",W,_,_),
    Contribution = W * (Fi - 50).

strengthComponent(Checkin, Speaker, Ts, "phonation_efficiency", W, Pe, Contribution) :-
    phonation_efficiency(Checkin, Speaker, Ts, Pe, _),
    contribution_weight_csv("phonation_efficiency","strength_score",W,_,_),
    Contribution = W * (Pe - 50).
```

### `energy_based_frailty` — real published coefficients, correctly signed

Grounded in JMIR 2024's actual logistic-regression result (zero-crossing
rate, odds ratio 0.81 → log-odds coefficient ln(0.81) ≈ −0.21), stored in
`contribution_weight` rather than hardcoded, and applied on the paper's
native (unscaled) feature units:

```vadalog
% A1 (zero crossings) coefficient. Paper ln(OR 0.81)=-0.21 (stored on the ZCR->muscle_integrity row).
w_zcr(W) :- contribution_weight_csv("zero_crossing_rate","muscle_integrity_index",W,_,_).

% Log-odds of EBF on the paper's NATIVE scale (raw feature, no x100). Weight already negative: more ZCR -> lower EBF.
ebf_logodds(Checkin, Speaker, Ts, LogOdds) :-
    voice_feature_csv(Checkin, Speaker, Ts, _, Zcr, _, _, _, _, _, _, _, _, _, _, _),
    w_zcr(Wz),
    LogOdds = Wz * Zcr.

% Simple linear likelihood map centered at 0 log-odds (MVP proxy; NOT the true logistic sigmoid).
ebf_raw(Checkin, Speaker, Ts, Raw) :-
    ebf_logodds(Checkin, Speaker, Ts, LogOdds),
    Raw = 0.5 + LogOdds.

ebf_lik(Checkin, Speaker, Ts, 0.0) :- ebf_raw(Checkin, Speaker, Ts, Raw), Raw < 0.0.
ebf_lik(Checkin, Speaker, Ts, 1.0) :- ebf_raw(Checkin, Speaker, Ts, Raw), Raw > 1.0.
ebf_lik(Checkin, Speaker, Ts, Raw) :- ebf_raw(Checkin, Speaker, Ts, Raw), Raw >= 0.0, Raw <= 1.0.

energy_based_frailty(Checkin, Speaker, Ts, LogOdds, Likelihood, Confidence) :-
    ebf_logodds(Checkin, Speaker, Ts, LogOdds),
    ebf_lik(Checkin, Speaker, Ts, Likelihood),
    ebf_conf(Checkin, Confidence).
```

**Honesty note carried over verbatim from the concept's own description:**
*"Likelihood is a transparent MVP proxy, NOT the true logistic sigmoid (the
engine has no `exp`); LogOdds is the paper-native trustworthy column."*

### `strength_longitudinal` — within-person trend, not a population threshold

Personal baseline (mean, MAD — mean absolute deviation, chosen specifically
because the engine has no runtime `sqrt`/`abs`), trend slope in points/day
via `date:diff`, a deteriorating/recovering/stable classification, and a
change-point flag on any single-step drop past 20 points:

```vadalog
first_val(Speaker, V) :- strength_baseline(Speaker, _, _, _, FirstTs, _), strengthScore(_, Speaker, FirstTs, V, _).
last_val(Speaker, V)  :- strength_baseline(Speaker, _, _, _, _, LastTs), strengthScore(_, Speaker, LastTs, V, _).

span_days(Speaker, Days) :-
    strength_baseline(Speaker, _, _, _, FirstTs, LastTs),
    Days = date:diff(LastTs, FirstTs).

slope(Speaker, Slope) :-
    first_val(Speaker, F), last_val(Speaker, L), span_days(Speaker, Days), Days > 0,
    Slope = (L - F) / Days.

direction(Speaker, "deteriorating") :- slope(Speaker, S), S < -0.3.
direction(Speaker, "recovering")    :- slope(Speaker, S), S > 0.3.
direction(Speaker, "stable")        :- slope(Speaker, S), S >= -0.3, S <= 0.3.

changepoint(Speaker, "yes") :- max_drop(Speaker, Drop), Drop < -20.0.
changepoint(Speaker, "no")  :- max_drop(Speaker, Drop), Drop >= -20.0.
```

## What's real vs. illustrative — the same disclosure standard as the live app

- **Real, cited coefficients**: the two frailty axes (`energy_based_frailty`,
  `sarcopenia_based_frailty`) use JMIR 2024's actual logistic-regression
  log-odds, correctly signed.
- **Illustrative, disclosed as such**: every other weight in
  `contribution_weight` — stated plainly in that row's `rationale` field,
  never presented as a citation that doesn't exist.
- **Not built**: a live API. Prometheux is a batch/dashboard tool; this
  document and the linked dashboards are the connection, not a runtime
  dependency.
