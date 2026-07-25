# Undertone

Voice-first chronic-care check-ins through a WebApp and WhatsApp.

## Stack

- Next.js on Vercel for the WebApp and API routes
- Eve + Vercel AI Gateway for the durable shared agent
- Vercel Chat SDK WhatsApp adapter for WhatsApp webhooks
- Supabase Auth, Postgres, and private Storage
- ElevenLabs for transcription and synthesized voice replies

## Start locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The health endpoint is available at `/api/health`.

## Structure

- `app/` — WebApp shell and HTTP routes
- `agent/` — Eve agent, typed tools, and staged WhatsApp channel
- `lib/` — provider-specific server integrations
- `supabase/schema.sql` — initial data model and row-level security

## Safety baseline

This project is a prototype. The agent must not diagnose or make treatment decisions. Use synthetic data for development and obtain explicit consent before retaining any voice recording.

## WhatsApp setup

Configure a WhatsApp Business app and point its webhook at the Eve-generated WhatsApp route after deployment. Add the WhatsApp and provider values from `.env.example` as Vercel environment variables. The WhatsApp adapter requires an access token, phone number ID, app secret, and a verify token.

Until those credentials exist, the channel is staged at `agent/integrations/whatsapp-channel.ts` so the WebApp can run locally. When the credentials are ready, move it to `agent/channels/whatsapp.ts`; Eve will then expose the WhatsApp channel. The current channel uses in-memory thread state for local development; change it to a durable Chat SDK state adapter before production.

