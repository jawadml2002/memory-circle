import { getProject, generateCode, revokeCode } from "@/lib/db";
import { cookies } from "next/headers";

async function getSession() {
  const cookieStore = await cookies();
  const s = cookieStore.get("owner_session");
  return s ? JSON.parse(s.value) : null;
}

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project || project.owner_email !== session.email)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const { action } = await req.json();
    if (action === "revoke") {
      await revokeCode(id);
      return Response.json({ code: null });
    }
    const code = await generateCode(id);
    return Response.json({ code });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}