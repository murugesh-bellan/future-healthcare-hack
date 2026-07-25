import { z } from "zod";
import { createVoiceReply } from "@/lib/voice";

const bodySchema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const audio = await createVoiceReply(parsed.data.text);
    return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
