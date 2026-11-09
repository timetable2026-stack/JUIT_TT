// Single-admin authentication: password from ADMIN_PASSWORD, session = HMAC-signed
// cookie. No user table, no faculty logins (faculty use the open link).
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "tt_admin";
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function secret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "dev-secret-change-me";
}
function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function checkPassword(given: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeSessionCookie(): string {
  const exp = Date.now() + TTL_MS;
  const payload = `admin.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure}`;
}
export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdmin(req: Request): boolean {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 3) return false;
  const [who, exp, sig] = parts;
  if (who !== "admin" || Number(exp) < Date.now()) return false;
  const expected = sign(`${who}.${exp}`);
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export function requireAdmin(req: Request): Response | null {
  if (isAdmin(req)) return null;
  return Response.json({ error: "Admin sign-in required" }, { status: 401 });
}
