import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolvePatientId, markConsented } from "@/lib/patients";

export default defineTool({
  description:
    "Record that the patient explicitly agreed to check-in tracking. Call once, the first time a patient consents, before ever calling save_check_in for them.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const principal = ctx.session.auth.current;
    if (!principal) throw new Error("No authenticated caller for this session.");
    const patientId = await resolvePatientId(principal);
    await markConsented(patientId);
    return { consented: true };
  },
});
