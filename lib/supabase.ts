import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

/** Cheap, throw-free check — use this before calling supabaseBrowser() anywhere that must
 *  still render (e.g. AnonAuthProvider) when there's no live backend configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** Browser-side Supabase client. Session is stored in cookies so server code sees the same session. */
export function supabaseBrowser() {
  if (!url || !anonKey) throw new Error("Supabase is not configured. Add the required environment variables.");
  if (!browserClient) browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
