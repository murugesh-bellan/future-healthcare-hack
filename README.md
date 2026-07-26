# Undertone

Voice-first chronic-care check-ins through a WebApp.

## Stack

- Next.js + Tailwind CSS v4 on Vercel for the WebApp and API routes
- Eve + Vercel AI Gateway for the durable shared agent
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
3. Pick your own `DEMO_ACCESS_CODE`, the four `DEMO_PATIENT_SP0{1,2,3,4}_{EMAIL,PASSWORD}` pairs, and `DEMO_CLINICIAN_{EMAIL,PASSWORD}`, then run `node scripts/seed-demo-patients.mjs` to create (or rotate) those Supabase accounts — this also enrolls the clinician account in `public.clinicians`, which is what actually gates `/clinician`. The web app gates on a fixed demo-identity picker (`components/AnonAuthProvider.tsx` → `/api/demo-login`) rather than open anonymous sign-in — see "How identity and consent work" below.

## Structure

- `app/` — WebApp pages (home, check-in, trends, coaching, evidence, how-it-works) and API routes
- `agent/` — Eve agent, typed tools (`save_check_in`, `confirm_consent`), and the eve channel
- `lib/` — Supabase clients (browser, server, admin), ElevenLabs, and patient resolution
- `components/` — shared TopBar/BottomNav and the demo-persona auth bootstrap
- `design/` — source design mockups the pages were built from
- `supabase/schema.sql` — data model and row-level security

## How identity and consent work

- The web app is currently gated behind fixed demo identities rather than open anonymous sign-in: `components/AnonAuthProvider.tsx` shows a picker behind a shared `DEMO_ACCESS_CODE`, and `/api/demo-login` performs the actual `signInWithPassword` server-side (credentials in `lib/demo-personas.ts`, sourced from env vars — never sent to the browser). The resulting session lives in cookies so both the browser and server see the same user, same as anonymous sign-in did before.
- `agent/channels/eve.ts` verifies that Supabase session on every eve request and attaches it as the caller's principal — the model never receives or chooses a patient id.
- `lib/patients.ts` resolves (and lazily creates) the `patients` row for that principal, keyed by `auth_user_id`.
- The `confirm_consent` and `save_check_in` tools both derive the patient from `ctx.session.auth.current` — `save_check_in` refuses to write until consent is on record. The check-in page shows an explicit consent step before the mic is enabled.
- All writes go through the service-role client (`lib/supabase-admin.ts`) from trusted server code only, after identity is verified above. Reads (trends, home) use the cookie-bound, RLS-scoped client (`lib/supabase-server.ts`).
- `/clinician` (the cohort view) is a separate authorization boundary from being merely signed in: `lib/clinician-auth.ts`'s `requireClinician()` runs server-side at the top of both `app/clinician/page.tsx` and `app/clinician/[speaker]/page.tsx`, checks the session against `public.clinicians`, and redirects home if the caller isn't enrolled there — being one of the demo patients (or being unauthenticated) is not enough. This check has to happen inside the Server Component itself, before any data is fetched, since `AnonAuthProvider`'s picker is a client-side UI convenience that runs after the server has already rendered the page.

## Safety baseline

This project is a prototype. The agent must not diagnose or make treatment decisions. Use synthetic data for development and obtain explicit consent before retaining any voice recording. The "Strength Score" shown in the UI is a lightweight, illustrative metric derived from check-in frequency — it is not a validated biometric.
