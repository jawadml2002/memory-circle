import { cookies } from "next/headers";
export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("owner_session");
  if (!session) return Response.json({ user: null });
  return Response.json({ user: JSON.parse(session.value) });
}