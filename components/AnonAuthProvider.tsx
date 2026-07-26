"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Public-safe persona metadata only — id and label, nothing that grants
 * access. The actual credentials live server-side in lib/demo-personas.ts
 * and are never sent to the client; picking a persona here just posts its id
 * (plus the access code below) to /api/demo-login, which performs the real
 * sign-in and enforces who's allowed to.
 */
const PERSONA_OPTIONS = [
  { id: "sp01", label: "Speaker 01" },
  { id: "sp02", label: "Speaker 02" },
  { id: "sp03", label: "Speaker 03" },
  { id: "sp04", label: "Speaker 04" },
] as const;

type Status = "checking" | "picking" | "signing-in" | "ready" | "error";

/**
 * Gates the app on a Supabase session before rendering, so RLS-scoped
 * reads/writes and the Eve channel's session auth always have a stable user
 * id. Instead of anonymous sign-in, this presents a picker between fixed
 * demo personas — appropriate while this is a demo/testing build, not yet
 * open to real anonymous visitors. Sign-in happens server-side (see
 * app/api/demo-login) behind a shared access code, so the demo credentials
 * never reach the browser and the endpoint isn't a public "become any demo
 * patient" route.
 *
 * When Supabase isn't configured at all (no live credentials yet), this
 * skips the gate entirely and renders the app directly — every screen
 * already falls back to real-Prometheux-derived sample data on its own
 * (see lib/trend-data.ts), so the app stays fully walkable with zero
 * backend. Without this, supabaseBrowser() throwing synchronously here
 * would have blocked every single screen, not just the ones that need
 * a live session.
 */
export function AnonAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(isSupabaseConfigured() ? "checking" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
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

  async function pickPersona(personaId: (typeof PERSONA_OPTIONS)[number]["id"]) {
    setStatus("signing-in");
    try {
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, accessCode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not sign in.");
      // Full reload so the browser client (and this provider) picks up the
      // session cookie the server just set, rather than trying to sync it in-place.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setStatus("error");
    }
  }

  if (status === "checking" || status === "signing-in") return null;

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-stack-md px-container-margin text-center">
        <p className="text-body-md text-on-surface-variant">{error}</p>
        <button onClick={() => setStatus("picking")} className="text-label-md text-primary">
          Try again
        </button>
      </main>
    );
  }

  if (status === "picking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-stack-lg px-container-margin text-center">
        <h1 className="text-headline-md text-on-surface">Who's checking in?</h1>
        <input
          type="password"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="Access code"
          aria-label="Access code"
          className="w-full max-w-xs rounded-full border border-outline-variant/30 bg-surface-container-low px-5 py-3 text-center text-body-md text-on-surface"
        />
        <div className="flex flex-col gap-stack-sm">
          {PERSONA_OPTIONS.map((persona) => (
            <button
              key={persona.id}
              onClick={() => pickPersona(persona.id)}
              disabled={!accessCode.trim()}
              className="rounded-full bg-primary px-8 py-3 text-label-md font-semibold text-on-primary transition-transform active:scale-95 disabled:opacity-50"
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
