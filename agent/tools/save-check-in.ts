import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveCheckIn } from "@/lib/save-check-in";

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

export default defineTool({
  description:
    "Save a consented patient check-in transcript. The patient's identity comes from the active session, not from input. Requires consent: call confirm_consent first if the patient has not consented yet. On web, check-ins are already saved directly by the client (see agent/instructions.md) — this tool is for WhatsApp and any other caller with no direct-save path. If the client context for this turn includes voice_signals, pass them through unchanged as voiceSignals.",
  inputSchema: z.object({
    text: z.string().min(1).max(5000),
    channel: z.enum(["web", "whatsapp"]),
    voiceSignals: voiceSignalsSchema,
  }),
  async execute({ text, channel, voiceSignals }, ctx) {
    const principal = ctx.session.auth.current;
    if (!principal) throw new Error("No authenticated caller for this session.");

    await saveCheckIn({ principal, text, channel, voiceSignals });
    return { saved: true };
  },
});
