import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireSupabase } from "@/lib/supabase";

export default defineTool({
  description: "Save a consented patient check-in. Do not call unless consent is confirmed.",
  inputSchema: z.object({
    patientId: z.string().uuid(),
    text: z.string().min(1).max(5000),
    channel: z.enum(["web", "whatsapp"]),
  }),
  async execute({ patientId, text, channel }) {
    const { error } = await requireSupabase().from("check_ins").insert({
      patient_id: patientId,
      transcript: text,
      channel,
    });
    if (error) throw new Error(error.message);
    return { saved: true };
  },
});
