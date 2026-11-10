// Admin: send one test message to prove the mailbox credentials work.
import { requireAdmin } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const to = String(body.to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ error: "Enter a valid address" }, { status: 400 });
  try { return Response.json(await sendTestEmail(to)); }
  catch (e: any) { return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 }); }
}
