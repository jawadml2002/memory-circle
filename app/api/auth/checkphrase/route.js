export async function POST(req) {
  const { passphrase } = await req.json();
  if (passphrase === process.env.OWNER_PASSPHRASE) {
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false }, { status: 401 });
}