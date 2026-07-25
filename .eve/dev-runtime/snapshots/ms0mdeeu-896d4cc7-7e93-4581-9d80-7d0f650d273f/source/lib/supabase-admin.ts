import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Deliberately untyped (no Database generic): the installed @supabase/supabase-js version
// resolves awaited/destructured query results to `never` when a custom Database generic is
// supplied (reproduced in isolation, unrelated to this schema). Call sites cast results to the
// row types in lib/database-types.ts instead. Annotate with the SupabaseClient class (not
// ReturnType<typeof createClient>) — the latter also collapses to `never` here.
let adminClient: SupabaseClient | null = null;

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
