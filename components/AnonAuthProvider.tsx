"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

/**
 * Fixed demo personas, seeded by scripts/seed-demo-patients.mjs. Not real
 * secrets — just stable identifiers so the same two patients are reachable
 * across devices/sessions during demos and testing.
 */
const PERSONAS = [
  { label: "Patient A", email: "demo-a@undertone.local", password: "undertone-demo-a-2026" },
  { label: "Patient B", email: "demo-b@undertone.local", password: "undertone-demo-b-2026" },
] as const;

type Status = "checking" | "picking" | "signing-in" | "ready" | "error";

/**
 * Gates the app on a Supabase session before rendering, so RLS-scoped
 * reads/writes and the Eve channel's session auth always have a stable user
 * id. Instead of anonymous sign-in, this presents a picker between two fixed
 * demo personas — appropriate while this is a demo/testing build, not yet
 * open to real anonymous visitors.
 */
export function AnonAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setStatus(data.session ? "ready" : "picking");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not check for an existing session.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pickPersona(persona: (typeof PERSONAS)[number]) {
    setStatus("signing-in");
    try {
      const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
        email: persona.email,
        password: persona.password,
      });
      if (signInError) throw signInError;
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setStatus("error");
    }
  }

  if (status === "checking" || status === "signing-in") return null;

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-container-margin text-center">
        <p className="text-body-md text-on-surface-variant">{error}</p>
      </main>
    );
  }

  if (status === "picking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-stack-lg px-container-margin text-center">
        <h1 className="text-headline-md text-on-surface">Who's checking in?</h1>
        <div className="flex flex-col gap-stack-sm">
          {PERSONAS.map((persona) => (
            <button
              key={persona.email}
              onClick={() => pickPersona(persona)}
              className="rounded-full bg-primary px-8 py-3 text-label-md font-semibold text-on-primary transition-transform active:scale-95"
            >
              {persona.label}
            </button>
          ))}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
