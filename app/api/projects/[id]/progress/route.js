import { updateProject, getProject } from "@/lib/db";

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { step } = await req.json();
    if (typeof step !== "number") return Response.json({ error: "Invalid step" }, { status: 400 });
    const project = await getProject(id);
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });
    await updateProject(id, { step, last_opened: new Date().toISOString() });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}