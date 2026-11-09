// Admin: re-email a publish to the faculty who have not yet marked it as seen.
import { requireAdmin } from "@/lib/auth";
import { changesByFaculty } from "@/lib/diff";
import { sendBatch } from "@/lib/email";
import { changeEmail, firstPublishEmail } from "@/lib/format";
import { siteConfig } from "@/lib/site";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const v = await store.getVersion(Number(body.versionId));
  if (!v || v.status === "draft") return Response.json({ error: "Version not found" }, { status: 404 });
  const seen = new Set((await store.listAcks([v.id])).map((a) => a.facultyId));
  const site = siteConfig();
  const byFac = changesByFaculty(v.changes);
  const targets = v.changes.length ? v.data.faculty.filter((f) => byFac.has(f.id)) : v.data.faculty;
  const items = targets.filter((f) => f.email && !seen.has(f.id)).map((f) => ({
    to: { facultyId: f.id, email: f.email, name: f.name },
    content: v.changes.length
      ? changeEmail({ data: v.data, faculty: f, changes: byFac.get(f.id)!, siteUrl: site.url, department: site.department, note: v.note, versionId: v.id })
      : firstPublishEmail({ data: v.data, faculty: f, siteUrl: site.url, department: site.department, note: v.note, semesterNames: v.data.semesters.map((s) => s.name) }),
  }));
  const log = await sendBatch("reminder", v.id, items);
  await store.addEmailLog(log);
  return Response.json({ ok: true, recipients: items.length, sent: log.filter((l) => l.status === "sent").length, skipped: log.filter((l) => l.status === "skipped").length, failed: log.filter((l) => l.status === "failed").length });
}
