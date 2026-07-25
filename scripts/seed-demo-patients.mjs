// One-time (idempotent) seed script for the two fixed demo personas used by
// the picker in components/AnonAuthProvider.tsx. Run with:
//   node scripts/seed-demo-patients.mjs
//
// Reads Supabase credentials from .env in the project root — not committed,
// not part of the deployed app.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// These are fixed demo identifiers, not real secrets — intentionally simple
// and mirrored in components/AnonAuthProvider.tsx.
const PERSONAS = [
  { label: "Patient A", email: "demo-a@undertone.local", password: "undertone-demo-a-2026" },
  { label: "Patient B", email: "demo-b@undertone.local", password: "undertone-demo-b-2026" },
];

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

async function seedPersona({ label, email, password }) {
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
    console.log(`${label}: auth user already exists (${user.id})`);
  }

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
    await supabase.from("patients").update({ consented_at: new Date().toISOString() }).eq("id", existingPatient.id);
    console.log(`${label}: patient row ${existingPatient.id} existed but wasn't consented — fixed`);
  } else {
    console.log(`${label}: patient row ${existingPatient.id} already consented`);
  }
}

for (const persona of PERSONAS) {
  await seedPersona(persona);
}

console.log("Done.");
