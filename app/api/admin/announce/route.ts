// Admin: post an announcement (portal alert, optionally emailed to the chosen audience).
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { invalidatePublicPayload } from "@/lib/publicPayload";
import { sendBatch } from "@/lib/email";
import { announcementEmail } from "@/lib/format";
import { siteConfig } from "@/lib/site";
import { getStore } from "@/lib/store";
import type { Announcement } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 5000);
  if (!title || !text) return Response.json({ error: "Title and body are required" }, { status: 400 });
  const audience: Announcement["audience"] = body.audience?.kind === "semester" ? { kind: "semester", semester: String(body.audience.semester) } : body.audience?.kind === "faculty" ? { kind: "faculty", ids: (body.audience.ids ?? []).map((s: string) => String(s).trim()) } : { kind: "all" };
  const store = getStore();
  const ann = await store.createAnnouncement({ createdAt: new Date().toISOString(), title, body: text, audience, emailed: Boolean(body.email), expiresAt: body.expiresAt ? String(body.expiresAt) : undefined });

  let emails = { sent: 0, failed: 0, skipped: 0, recipients: 0 };
  if (body.email) {
    const live = await store.getPublished();
    const site = siteConfig();
    const faculty = live?.data.faculty ?? [];
    const recipients = faculty.filter((f) => {
      if (!f.email) return false;
      if (audience.kind === "all") return true;
      if (audience.kind === "faculty") return audience.ids.includes(f.id);
      return live!.data.slots.some((s) => s.semester === audience.semester && s.facultyIds.includes(f.id));
    });
    const log = await sendBatch("announcement", ann.id, recipients.map((f) => ({ to: { facultyId: f.id, email: f.email, name: f.name }, content: announcementEmail({ title, body: text, faculty: f, siteUrl: site.url, department: site.department }) })));
    await store.addEmailLog(log);
    emails = { sent: log.filter((l) => l.status === "sent").length, failed: log.filter((l) => l.status === "failed").length, skipped: log.filter((l) => l.status === "skipped").length, recipients: recipients.length };
  }
  invalidatePublicPayload(); revalidatePath("/");
  return Response.json({ ok: true, announcement: ann, emails });
}

export const POST = (req: Request) => withErrors(() => handlePOST(req));

/** Turn any unexpected failure into a readable message instead of a bare 500. */
async function withErrors(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); }
  catch (e: any) {
    const msg = String(e?.message ?? e);
    const hint = /EROFS|read-only|ENOENT|EACCES/i.test(msg)
      ? " The server could not write its data file. Connect the database (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables) and redeploy."
      : /relation .* does not exist|schema cache/i.test(msg)
      ? " The database tables are missing: run supabase/schema.sql in the Supabase SQL editor."
      : "";
    console.error(msg);
    return Response.json({ error: `Something went wrong: ${msg}.${hint}` }, { status: 500 });
  }
}
