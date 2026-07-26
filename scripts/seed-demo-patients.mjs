// One-time (idempotent) seed script for the fixed demo identities used by
// the picker in components/AnonAuthProvider.tsx: four patient personas plus
// one clinician (staff) account. Run with:
//   node scripts/seed-demo-patients.mjs
//
// Reads Supabase credentials from .env and/or .env.local in the project root
// (same precedence Next.js uses — .env.local overrides .env) — neither file
// is committed or part of the deployed app.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

for (const filename of [".env", ".env.local"]) {
  const path = join(root, filename);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

// Single source of truth for both the seed script and lib/demo-personas.ts —
// no credentials duplicated in source. Re-running this script rotates the
// live password to whatever's currently in .env.
const PERSONAS = [
  { label: "Speaker 01", email: requireEnv("DEMO_PATIENT_SP01_EMAIL"), password: requireEnv("DEMO_PATIENT_SP01_PASSWORD") },
  { label: "Speaker 02", email: requireEnv("DEMO_PATIENT_SP02_EMAIL"), password: requireEnv("DEMO_PATIENT_SP02_PASSWORD") },
  { label: "Speaker 03", email: requireEnv("DEMO_PATIENT_SP03_EMAIL"), password: requireEnv("DEMO_PATIENT_SP03_PASSWORD") },
  { label: "Speaker 04", email: requireEnv("DEMO_PATIENT_SP04_EMAIL"), password: requireEnv("DEMO_PATIENT_SP04_PASSWORD") },
];

const CLINICIAN = {
  label: "Clinician (staff)",
  email: requireEnv("DEMO_CLINICIAN_EMAIL"),
  password: requireEnv("DEMO_CLINICIAN_PASSWORD"),
};

async function findExistingUserByEmail(email) {
  // Admin listUsers doesn't support filtering by email server-side in all
  // versions, so page through and match — fine at this tiny scale.
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function createOrRotateUser({ label, email, password }) {
  let user = await findExistingUserByEmail(email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`${label}: created auth user ${user.id}`);
  } else {
    // Rotate to whatever password is currently in .env, so re-running this
    // script after changing .env actually changes the live credential.
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (updateError) throw updateError;
    console.log(`${label}: auth user already exists (${user.id}) — password rotated`);
  }

  return user;
}

async function seedPersona(persona) {
  const { label } = persona;
  const user = await createOrRotateUser(persona);

  const { data: existingPatient, error: selectError } = await supabase
    .from("patients")
    .select("id, consented_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (selectError) throw selectError;

  if (!existingPatient) {
    const { data: created, error: insertError } = await supabase
      .from("patients")
      .insert({ auth_user_id: user.id, consented_at: new Date().toISOString() })
      .select("id")
      .single();
    if (insertError) throw insertError;
    console.log(`${label}: created patient row ${created.id} (pre-consented)`);
  } else if (!existingPatient.consented_at) {
    const { error: updateError } = await supabase
      .from("patients")
      .update({ consented_at: new Date().toISOString() })
      .eq("id", existingPatient.id);
    if (updateError) throw updateError;
    console.log(`${label}: patient row ${existingPatient.id} existed but wasn't consented — fixed`);
  } else {
    console.log(`${label}: patient row ${existingPatient.id} already consented`);
  }
}

async function seedClinician(clinician) {
  const { label } = clinician;
  const user = await createOrRotateUser(clinician);

  const { data: existing, error: selectError } = await supabase
    .from("clinicians")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (selectError) throw selectError;

  if (!existing) {
    const { error: insertError } = await supabase.from("clinicians").insert({ auth_user_id: user.id });
    if (insertError) throw insertError;
    console.log(`${label}: added to public.clinicians`);
  } else {
    console.log(`${label}: already in public.clinicians`);
  }
}

for (const persona of PERSONAS) {
  await seedPersona(persona);
}
await seedClinician(CLINICIAN);

console.log("Done.");
