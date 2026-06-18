import { getProject, updateProject, deleteProject } from "@/lib/db";
import { cookies } from "next/headers";

async function getSession() {
  const cookieStore = await cookies();
  const s = cookieStore.get("owner_session");
  return s ? JSON.parse(s.value) : null;
}

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ project });
}

export async function PATCH(req, { params }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project || project.owner_email !== session.email)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const updated = await updateProject(id, body);
    return Response.json({ project: updated });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project || project.owner_email !== session.email)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteProject(id);
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}
