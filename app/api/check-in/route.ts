import { z } from "zod";
import { supabaseServer } from "@/lib/supabase-server";
import { saveCheckIn, ConsentRequiredError } from "@/lib/save-check-in";

const voiceSignalsSchema = z
  .object({
    meanPitchHz: z.number().nullable().optional(),
    pitchStdHz: z.number().nullable().optional(),
    jitterPercent: z.number().nullable().optional(),
    shimmerPercent: z.number().nullable().optional(),
    meanEnergyRms: z.number().nullable().optional(),
    pauseRatio: z.number().nullable().optional(),
    speechRateWpm: z.number().nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
    voicedSegmentDurationSeconds: z.number().nullable().optional(),
  })
  .optional();

const bodySchema = z.object({
  text: z.string().min(1).max(5000),
  voiceSignals: voiceSignalsSchema,
  idempotencyKey: z.string().min(1).max(200).optional(),
});

/**
 * Direct-save path for web check-ins — saves the transcript (and any voice
 * signals) immediately, independent of the agent's turn, so the model isn't
 * on the hook for a DB round trip before it can start replying. WhatsApp has
 * no equivalent (no browser JS to call this from) and keeps using the
 * `save_check_in` tool via `lib/save-check-in.ts`'s shared `saveCheckIn`.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const supabase = await supabaseServer();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    const { checkInId } = await saveCheckIn({
      principal: { authenticator: "supabase", principalId: data.user.id },
      text: parsed.data.text,
      channel: "web",
      voiceSignals: parsed.data.voiceSignals,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return Response.json({ ok: true, checkInId });
  } catch (err) {
    if (err instanceof ConsentRequiredError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Could not save your check-in.";
    return Response.json({ error: message }, { status: 500 });
  }
}
