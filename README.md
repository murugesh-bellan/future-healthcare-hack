# Undertone

Voice-first chronic-care check-ins through a WebApp and WhatsApp.

## Stack

- Next.js + Tailwind CSS v4 on Vercel for the WebApp and API routes
- Eve + Vercel AI Gateway for the durable shared agent
- Eve's Twilio channel (`eve/channels/twilio`) for WhatsApp, via Twilio's WhatsApp Sandbox/sender
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
- `agent/` — Eve agent, typed tools (`save_check_in`, `confirm_consent`), and the eve/WhatsApp channels
- `lib/` — Supabase clients (browser, server, admin), ElevenLabs, and patient resolution
- `components/` — shared TopBar/BottomNav and the demo-persona auth bootstrap
- `design/` — source design mockups the pages were built from
- `supabase/schema.sql` — data model and row-level security

## How identity and consent work

- The web app is currently gated behind fixed demo identities rather than open anonymous sign-in: `components/AnonAuthProvider.tsx` shows a picker behind a shared `DEMO_ACCESS_CODE`, and `/api/demo-login` performs the actual `signInWithPassword` server-side (credentials in `lib/demo-personas.ts`, sourced from env vars — never sent to the browser). The resulting session lives in cookies so both the browser and server see the same user, same as anonymous sign-in did before.
- `agent/channels/eve.ts` verifies that Supabase session on every eve request and attaches it as the caller's principal — the model never receives or chooses a patient id.
- `lib/patients.ts` resolves (and lazily creates) the `patients` row for that principal: by `auth_user_id` for web/Supabase callers, by `whatsapp_user_id` for WhatsApp callers.
- The `confirm_consent` and `save_check_in` tools both derive the patient from `ctx.session.auth.current` — `save_check_in` refuses to write until consent is on record. The check-in page shows an explicit consent step before the mic is enabled; WhatsApp gets consent conversationally per `agent/instructions.md`.
- All writes go through the service-role client (`lib/supabase-admin.ts`) from trusted server code only, after identity is verified above. Reads (trends, home) use the cookie-bound, RLS-scoped client (`lib/supabase-server.ts`).
- `/clinician` (the cohort view) is a separate authorization boundary from being merely signed in: `lib/clinician-auth.ts`'s `requireClinician()` runs server-side at the top of both `app/clinician/page.tsx` and `app/clinician/[speaker]/page.tsx`, checks the session against `public.clinicians`, and redirects home if the caller isn't enrolled there — being one of the demo patients (or being unauthenticated) is not enough. This check has to happen inside the Server Component itself, before any data is fetched, since `AnonAuthProvider`'s picker is a client-side UI convenience that runs after the server has already rendered the page.

## Safety baseline

This project is a prototype. The agent must not diagnose or make treatment decisions. Use synthetic data for development and obtain explicit consent before retaining any voice recording. The "Strength Score" shown in the UI is a lightweight, illustrative metric derived from check-in frequency — it is not a validated biometric.

## WhatsApp setup

The channel lives at `agent/channels/whatsapp.ts`, built on eve's Twilio channel (`eve/channels/twilio`) rather than a WhatsApp-specific SDK — Twilio's Messages API is the same for SMS and WhatsApp, just with numbers formatted as `whatsapp:+1415...`, so no WhatsApp-specific adapter is needed. To go live:

1. In the Twilio Console, activate the WhatsApp Sandbox (Messaging → Try it out → Send a WhatsApp message) for instant testing with no Meta business verification, or apply for your own WhatsApp Business sender for production.
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (also verifies inbound webhook signatures), `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886` for the Sandbox), and `TWILIO_ALLOWED_FROM` (comma-separated `whatsapp:+...` numbers permitted to reach the agent — required, not `"*"`, so the shared Sandbox number can't let a stranger who joined it start creating patient rows) as Vercel environment variables.
3. Point the Sandbox's (or your sender's) Messaging webhook at `/eve/v1/twilio/messages` on the deployed app.
4. Each tester joins the Sandbox once by sending its join code (shown in the Twilio Console) to the Sandbox number from their own WhatsApp.




