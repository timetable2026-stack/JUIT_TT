// Admin: post an announcement (portal alert, optionally emailed to the chosen audience).
import { requireAdmin } from "@/lib/auth";
import { sendBatch } from "@/lib/email";
import { announcementEmail } from "@/lib/format";
import { siteConfig } from "@/lib/site";
import { getStore } from "@/lib/store";
import type { Announcement } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 5000);
  if (!title || !text) return Response.json({ error: "Title and body are required" }, { status: 400 });
  const audience: Announcement["audience"] = body.audience?.kind === "semester" ? { kind: "semester", semester: String(body.audience.semester) } : body.audience?.kind === "faculty" ? { kind: "faculty", ids: (body.audience.ids ?? []).map((s: string) => String(s).toUpperCase()) } : { kind: "all" };
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
  return Response.json({ ok: true, announcement: ann, emails });
}
