import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase-server";
import { findDemoPersona } from "@/lib/demo-personas";

const bodySchema = z.object({ personaId: z.enum(["a", "b"]), accessCode: z.string().min(1) });

function isCorrectAccessCode(candidate: string): boolean {
  const expected = process.env.DEMO_ACCESS_CODE;
  if (!expected) return false;
  // Hash both sides to fixed-length digests before comparing — timingSafeEqual
  // requires equal-length buffers, and this avoids leaking the real length too.
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

/**
 * Signs in as one of the two fixed demo personas. Gated behind a shared
 * access code (DEMO_ACCESS_CODE) so this isn't a public "become any demo
 * patient" endpoint — moving credentials server-side only stops browser
 * bundling, it doesn't restrict who can call the route. Credentials
 * themselves stay server-side (lib/demo-personas.ts) and the resulting
 * session cookie is set directly via supabaseServer(), which is
 * cookie-writable from a Route Handler.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  if (!isCorrectAccessCode(parsed.data.accessCode)) {
    return Response.json({ error: "Incorrect access code." }, { status: 401 });
  }

  const persona = findDemoPersona(parsed.data.personaId);
  if (!persona) return Response.json({ error: "Unknown persona." }, { status: 400 });

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: persona.email,
    password: persona.password,
  });
  if (error) return Response.json({ error: error.message }, { status: 401 });

  return Response.json({ ok: true });
}
