import { transcribeVoiceNote } from "@/lib/voice";

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Missing audio file." }, { status: 400 });
  }

  try {
    const result = await transcribeVoiceNote(audio);
    return Response.json({ text: result.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
