import { getAllProjects, createProject } from "@/lib/db";
import { cookies } from "next/headers";

async function getSession() {
  const cookieStore = await cookies();
  const s = cookieStore.get("owner_session");
  return s ? JSON.parse(s.value) : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const projects = await getAllProjects(session.email);
    return Response.json({ projects });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { name } = await req.json();
    const project = await createProject(session.email, name);
    return Response.json({ project });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}
