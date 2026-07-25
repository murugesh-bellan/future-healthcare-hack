"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

/**
 * Ensures every visitor has a Supabase session (anonymous sign-in) before rendering the app,
 * so RLS-scoped reads/writes and the Eve channel's session auth always have a stable user id.
 * Requires "Anonymous sign-ins" enabled in the Supabase project's Auth settings.
 */
export function AnonAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function ensureSession() {
      try {
        const supabase = supabaseBrowser();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
        }
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start a session.");
      }
    }
    void ensureSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-container-margin text-center">
        <p className="text-body-md text-on-surface-variant">{error}</p>
      </main>
    );
  }

  if (!ready) return null;

  return <>{children}</>;
}
