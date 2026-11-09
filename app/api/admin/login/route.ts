import { checkPassword, makeSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!process.env.ADMIN_PASSWORD) return Response.json({ error: "ADMIN_PASSWORD is not set on the server." }, { status: 500 });
  if (!checkPassword(String(password ?? ""))) return Response.json({ error: "Incorrect password" }, { status: 401 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": makeSessionCookie() } });
}
