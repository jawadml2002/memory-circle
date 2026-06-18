import { createClient } from "@supabase/supabase-js";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

export async function getAllProjects(ownerEmail) {
  const { data, error } = await getDb()
    .from("projects")
    .select("*")
    .eq("owner_email", ownerEmail)
    .order("last_opened", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getProject(id) {
  const { data } = await getDb()
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  return data || null;
}

export async function createProject(ownerEmail, name) {
  const { data, error } = await getDb()
    .from("projects")
    .insert({
      name: name || "Untitled project",
      owner_email: ownerEmail,
      sequence: [],
      step: 0,
      interval_sec: 2,
      share_code: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, fields) {
  const { data, error } = await getDb()
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await getDb().from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function getProjectByCode(code) {
  const { data } = await getDb()
    .from("projects")
    .select("*")
    .eq("share_code", code.trim().toUpperCase())
    .single();
  return data || null;
}

export async function generateCode(projectId) {
  const C = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) =>
    Array.from({ length: n }, () => C[Math.floor(Math.random() * C.length)]).join("");
  for (let i = 0; i < 10; i++) {
    const code = `SART-${part(4)}-${part(4)}`;
    const existing = await getProjectByCode(code);
    if (!existing) {
      await updateProject(projectId, { share_code: code });
      return code;
    }
  }
  throw new Error("Could not generate unique code");
}

export async function revokeCode(projectId) {
  await updateProject(projectId, { share_code: null });
}

export async function getOwner(email) {
  const { data } = await getDb()
    .from("owners")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .single();
  return data || null;
}

export async function createOwner(email, passwordHash, name) {
  const { data, error } = await getDb()
    .from("owners")
    .insert({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
