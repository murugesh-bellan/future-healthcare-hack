// Server-only. Never import this from a "use client" component — the whole
// point is that these credentials must not reach the browser bundle.
// Credentials live in env vars (not committed) — see scripts/seed-demo-patients.mjs,
// which creates/rotates these accounts from the same source.

export interface DemoPersona {
  id: "a" | "b";
  label: string;
  email: string;
  password: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getDemoPersonas(): readonly DemoPersona[] {
  return [
    { id: "a", label: "Patient A", email: requireEnv("DEMO_PATIENT_A_EMAIL"), password: requireEnv("DEMO_PATIENT_A_PASSWORD") },
    { id: "b", label: "Patient B", email: requireEnv("DEMO_PATIENT_B_EMAIL"), password: requireEnv("DEMO_PATIENT_B_PASSWORD") },
  ];
}

export function findDemoPersona(id: string): DemoPersona | undefined {
  return getDemoPersonas().find((p) => p.id === id);
}
