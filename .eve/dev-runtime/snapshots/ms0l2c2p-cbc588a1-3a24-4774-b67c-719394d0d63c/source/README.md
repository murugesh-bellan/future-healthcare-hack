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

1. A Supabase project with **Anonymous sign-ins enabled** (Authentication → Sign In / Providers → Anonymous). The web app signs visitors in anonymously on first load so check-ins have a stable, RLS-scoped owner without a login screen.
2. `supabase/schema.sql` applied to that project.
3. The env vars in `.env.example` filled in (Supabase URL/anon key/service role key, `AI_GATEWAY_API_KEY`, ElevenLabs key + voice id).

## Structure

- `app/` — WebApp pages (home, check-in, trends, coaching, evidence, how-it-works) and API routes
- `agent/` — Eve agent, typed tools (`save_check_in`, `confirm_consent`), and the eve/WhatsApp channels
- `lib/` — Supabase clients (browser, server, admin), ElevenLabs, and patient resolution
- `components/` — shared TopBar/BottomNav and the anonymous-auth bootstrap
- `design/` — source design mockups the pages were built from
- `supabase/schema.sql` — data model and row-level security

## How identity and consent work

- The browser signs in anonymously via Supabase on first load (`components/AnonAuthProvider.tsx`); the session lives in cookies so both the browser and server see the same user.
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
