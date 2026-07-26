// Server-only. Never import this from a "use client" component — the whole
// point is that these credentials must not reach the browser bundle.
// Credentials live in env vars (not committed) — see scripts/seed-demo-patients.mjs,
// which creates/rotates these accounts from the same source.

export type DemoPersonaId = "sp01" | "sp02" | "sp03" | "sp04";

export interface DemoPersona {
  id: DemoPersonaId;
  label: string;
  email: string;
  password: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/**
 * Demo identities match the real Prometheux "Undertone Physiological Voice
 * Engine" speakers (SP01-SP04) rather than generic "Patient A/B" — same
 * speaker ids used in lib/prometheux-patients.ts and the clinician view, so
 * a patient's own check-in history and their entry in the cohort table are
 * recognizably the same person.
 */
export function getDemoPersonas(): readonly DemoPersona[] {
  return [
    { id: "sp01", label: "Speaker 01", email: requireEnv("DEMO_PATIENT_SP01_EMAIL"), password: requireEnv("DEMO_PATIENT_SP01_PASSWORD") },
    { id: "sp02", label: "Speaker 02", email: requireEnv("DEMO_PATIENT_SP02_EMAIL"), password: requireEnv("DEMO_PATIENT_SP02_PASSWORD") },
    { id: "sp03", label: "Speaker 03", email: requireEnv("DEMO_PATIENT_SP03_EMAIL"), password: requireEnv("DEMO_PATIENT_SP03_PASSWORD") },
    { id: "sp04", label: "Speaker 04", email: requireEnv("DEMO_PATIENT_SP04_EMAIL"), password: requireEnv("DEMO_PATIENT_SP04_PASSWORD") },
  ];
}

export function findDemoPersona(id: string): DemoPersona | undefined {
  return getDemoPersonas().find((p) => p.id === id);
}
