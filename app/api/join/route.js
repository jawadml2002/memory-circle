import { getProjectByCode } from "@/lib/db";

export async function POST(req) {
  try {
    const { code } = await req.json();
    if (!code) return Response.json({ error: "Please enter a code" }, { status: 400 });
    const project = await getProjectByCode(code);
    if (!project) return Response.json({ error: "That code does not match any project. Check for typos and try again." }, { status: 404 });
    return Response.json({ project });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}