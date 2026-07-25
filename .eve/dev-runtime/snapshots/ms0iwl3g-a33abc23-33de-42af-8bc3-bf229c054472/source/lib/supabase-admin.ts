import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: ReturnType<typeof createClient> | null = null;

/**
 * Service-role Supabase client. Bypasses row-level security — use only from trusted server
 * code (tool `execute`, route handlers) that has already verified the caller's identity.
 */
export function requireSupabaseAdmin() {
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin client is not configured. Add SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}
