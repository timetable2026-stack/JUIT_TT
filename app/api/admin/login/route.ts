import { checkPassword, makeSessionCookie } from "@/lib/auth";

// Best-effort brute-force protection: per-IP attempts within a window (per server instance).
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000, MAX = 8;

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= MAX) return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!process.env.ADMIN_PASSWORD) return Response.json({ error: "ADMIN_PASSWORD is not set on the server." }, { status: 500 });
  if (!checkPassword(String(password ?? ""))) {
    attempts.set(ip, { n: (a && a.until > now ? a.n : 0) + 1, until: now + WINDOW_MS });
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }
  attempts.delete(ip);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": makeSessionCookie() } });
}
