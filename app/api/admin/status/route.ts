// Admin: is the session valid, and what is configured on the server.
import { isAdmin } from "@/lib/auth";
import { spaceOf } from "@/lib/space";
import { emailConfigured, emailFrom, emailTransport } from "@/lib/email";
import { siteConfig } from "@/lib/site";
import { getStore, storeKind } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = isAdmin(req);
  if (!admin) return Response.json({ admin: false });
  const space = spaceOf(req);
  const store = getStore(space);
  let rows;
  try {
    rows = await Promise.all([store.listVersionSummaries(60), store.listEmailLog(300), store.listAnnouncements(), store.listAcks(), store.listPrefs(), store.getSettings()]);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const hint = space.id && /does not exist|relation|schema cache/i.test(msg) ? ` This copy's tables are not created yet: run supabase/schema${space.suffix}.sql once in Supabase → SQL editor.` : "";
    return Response.json({ error: `Database error: ${msg}.${hint}` }, { status: 500 });
  }
  const [versions, emailLog, announcements, acks, prefs, settings] = rows;
  return Response.json({
    admin: true,
    config: { store: storeKind(), email: emailConfigured(), transport: emailTransport(), from: emailFrom(), site: siteConfig(), cron: Boolean(process.env.CRON_SECRET) },
    versions: versions.map((v) => ({ id: v.id, status: v.status, createdAt: v.createdAt, publishedAt: v.publishedAt, note: v.note, fileName: v.fileName, summary: v.summary, changes: v.changes, issues: [], faculty: v.faculty, semesters: v.semesters })),
    emailLog, announcements, acks, prefs, settings,
  });
}
