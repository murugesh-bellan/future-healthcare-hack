import { twilioChannel } from "eve/channels/twilio";

/**
 * WhatsApp via Twilio's WhatsApp Sandbox (or a Twilio WhatsApp-enabled
 * sender, once approved) — Twilio's Messages API is the same for SMS and
 * WhatsApp, just with numbers formatted as "whatsapp:+1415...", so this
 * reuses eve's Twilio channel unchanged rather than a WhatsApp-specific one.
 * Only WhatsApp is wired up (see onVoice below) — this is not a phone/SMS
 * channel for this app.
 *
 * Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (the latter also verifies
 * inbound webhook signatures) and TWILIO_WHATSAPP_FROM, e.g.
 * "whatsapp:+14155238886" for the Sandbox. TWILIO_ALLOWED_FROM is a
 * comma-separated allow list of "whatsapp:+..." numbers permitted to reach
 * the agent — required (not "*") so the shared Sandbox number doesn't let
 * any stranger who joins it start creating patient rows.
 */
function allowedFrom(): readonly string[] {
  const raw = process.env.TWILIO_ALLOWED_FROM;
  if (!raw) return [];
  return raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

export default twilioChannel({
  allowFrom: allowedFrom(),
  messaging: { from: process.env.TWILIO_WHATSAPP_FROM },
  // Voice isn't part of this integration — reject every call rather than
  // silently falling back to the channel's default speech-gathering flow.
  onVoice: () => null,
  onText: (_ctx, message) => ({
    auth: {
      authenticator: "whatsapp",
      principalId: message.from,
      principalType: "user",
      attributes: {},
    },
  }),
});
