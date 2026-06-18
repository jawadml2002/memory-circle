import { getOwner, createOwner } from "@/lib/db";
import { cookies } from "next/headers";
import crypto from "crypto";

function hashPw(pw) {
  return crypto.createHash("sha256").update(pw + "mc_salt_2024").digest("hex");
}

export async function POST(req) {
  try {
    const { email, password, action, name, passphrase } = await req.json();
    if (passphrase !== process.env.OWNER_PASSPHRASE) {
      return Response.json({ error: "Invalid passphrase" }, { status: 401 });
    }
    const hash = hashPw(password);
    if (action === "register") {
      const existing = await getOwner(email);
      if (existing) return Response.json({ error: "Email already in use" }, { status: 409 });
      const owner = await createOwner(email, hash, name || email.split("@")[0]);
      const cookieStore = await cookies();
      cookieStore.set("owner_session", JSON.stringify({ email: owner.email, name: owner.name }), {
        httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/",
      });
      return Response.json({ ok: true, name: owner.name });
    } else {
      const owner = await getOwner(email);
      if (!owner || owner.password_hash !== hash) {
        return Response.json({ error: "Incorrect email or password" }, { status: 401 });
      }
      const cookieStore = await cookies();
      cookieStore.set("owner_session", JSON.stringify({ email: owner.email, name: owner.name }), {
        httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/",
      });
      return Response.json({ ok: true, name: owner.name });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}