// Publish pipeline shared by the publish and rollback routes:
// recompute the diff against the live version, flip statuses, post alerts
// (the changes themselves), and email only the affected faculty.
import { changesByFaculty, diffDatasets, summarize } from "./diff";
import { sendBatch, type Recipient } from "./email";
import { changeEmail, firstPublishEmail, type EmailContent } from "./format";
import { siteConfig } from "./site";
import { getStore } from "./store";
import type { Dataset, Version } from "./types";

export interface PublishResult {
  version: Version;
  emails: { sent: number; failed: number; skipped: number; recipients: number };
}

export async function publishDataset(opts: { data: Dataset; note?: string; fileName?: string; issues: Version["issues"]; existingDraftId?: number; sendEmail: boolean }): Promise<PublishResult> {
  const store = getStore();
  const site = siteConfig();
  const live = await store.getPublished();
  const prefs = new Map((await store.listPrefs()).map((p) => [p.facultyId, p]));
  const wantsEmail = (id: string) => prefs.get(id)?.changeEmails !== false;
  const changes = diffDatasets(live?.data ?? null, opts.data);
  const now = new Date().toISOString();

  let version: Version;
  if (opts.existingDraftId) {
    await store.updateVersion(opts.existingDraftId, { status: "published", publishedAt: now, note: opts.note, changes, summary: summarize(opts.data, changes) });
    version = (await store.getVersion(opts.existingDraftId))!;
  } else {
    version = await store.createVersion({ status: "published", createdAt: now, publishedAt: now, note: opts.note, fileName: opts.fileName, data: opts.data, changes, issues: opts.issues, summary: summarize(opts.data, changes) });
  }
  if (live && live.id !== version.id) await store.updateVersion(live.id, { status: "superseded" });

  // ---- Emails
  const items: { to: Recipient; content: EmailContent }[] = [];
  const facById = new Map(opts.data.faculty.map((f) => [f.id, f]));
  if (opts.sendEmail) {
    if (!live) {
      const semesterNames = opts.data.semesters.map((s) => s.name);
      for (const f of opts.data.faculty) {
        if (!f.email || !wantsEmail(f.id)) continue;
        items.push({ to: { facultyId: f.id, email: f.email, name: f.name }, content: firstPublishEmail({ data: opts.data, faculty: f, siteUrl: site.url, department: site.department, note: opts.note, semesterNames }) });
      }
    } else {
      for (const [fid, mine] of changesByFaculty(changes)) {
        const f = facById.get(fid) ?? live.data.faculty.find((x) => x.id === fid);
        if (!f?.email || !wantsEmail(f.id)) continue;
        items.push({ to: { facultyId: f.id, email: f.email, name: f.name }, content: changeEmail({ data: opts.data, faculty: f, changes: mine, siteUrl: site.url, department: site.department, note: opts.note, versionId: version.id }) });
      }
    }
  }
  const log = await sendBatch("publish", version.id, items);
  await store.addEmailLog(log);
  const count = (s: string) => log.filter((l) => l.status === s).length;
  return { version, emails: { sent: count("sent"), failed: count("failed"), skipped: count("skipped"), recipients: items.length } };
}
