const elevenLabsUrl = "https://api.elevenlabs.io/v1";

function elevenLabsHeaders() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  return { "xi-api-key": apiKey };
}

export async function transcribeVoiceNote(audio: Blob) {
  const body = new FormData();
  body.append("file", audio, "check-in.ogg");
  body.append("model_id", "scribe_v2");
  body.append("tag_audio_events", "true");
  body.append("keyterms", "GLP-1, semaglutide, tirzepatide");

  const response = await fetch(`${elevenLabsUrl}/speech-to-text`, {
    method: "POST",
    headers: elevenLabsHeaders(),
    body,
  });
  if (!response.ok) throw new Error(`ElevenLabs transcription failed: ${response.status}`);
  return response.json() as Promise<{ text: string; language_code?: string }>;
}

/**
 * Uses ElevenLabs' streaming endpoint and returns the raw Response so the
 * caller can forward `response.body` straight through instead of buffering
 * the whole clip here first — overlaps the ElevenLabs→server and
 * server→browser transfers instead of fully serializing them.
 */
export async function createVoiceReply(text: string): Promise<Response> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not configured.");
  const response = await fetch(`${elevenLabsUrl}/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: { ...elevenLabsHeaders(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
  });
  if (!response.ok) throw new Error(`ElevenLabs speech generation failed: ${response.status}`);
  return response;
}
