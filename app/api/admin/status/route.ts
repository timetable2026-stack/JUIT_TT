// Admin: is the session valid, and what is configured on the server.
import { isAdmin } from "@/lib/auth";
import { emailConfigured, emailFrom, emailTransport } from "@/lib/email";
import { siteConfig } from "@/lib/site";
import { getStore, storeKind } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = isAdmin(req);
  if (!admin) return Response.json({ admin: false });
  const store = getStore();
  const [versions, emailLog, announcements, acks, prefs, settings] = await Promise.all([
    store.listVersions(), store.listEmailLog(300), store.listAnnouncements(), store.listAcks(), store.listPrefs(), store.getSettings(),
  ]);
  return Response.json({
    admin: true,
    config: { store: storeKind(), email: emailConfigured(), transport: emailTransport(), from: emailFrom(), site: siteConfig(), cron: Boolean(process.env.CRON_SECRET) },
    versions: versions.map((v) => ({ id: v.id, status: v.status, createdAt: v.createdAt, publishedAt: v.publishedAt, note: v.note, fileName: v.fileName, summary: v.summary, changes: v.changes, issues: v.issues, faculty: v.data.faculty, semesters: v.data.semesters.map((s) => s.name) })),
    emailLog, announcements, acks, prefs, settings,
  });
}
