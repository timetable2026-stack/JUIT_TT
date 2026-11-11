// Persistence. Supabase (Postgres) in production; a JSON file in ./data for local
// development when SUPABASE_URL is not set. Both expose the same interface.
import { DEFAULT_SETTINGS, type Ack, type Announcement, type EmailLogEntry, type Prefs, type Settings, type Version, type VersionSummary } from "./types";

export interface Store {
  listVersions(): Promise<Version[]>; // newest first, full rows (heavy: avoid on hot paths)
  listVersionSummaries(limit?: number): Promise<VersionSummary[]>; // newest first, no slot data
  getVersion(id: number): Promise<Version | null>;
  getPublished(): Promise<Version | null>;
  createVersion(v: Omit<Version, "id">): Promise<Version>;
  updateVersion(id: number, patch: Partial<Version>): Promise<void>;
  listAcks(versionIds?: number[]): Promise<Ack[]>;
  addAck(a: Ack): Promise<void>;
  listAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(a: Omit<Announcement, "id">): Promise<Announcement>;
  listEmailLog(limit?: number): Promise<EmailLogEntry[]>;
  addEmailLog(entries: Omit<EmailLogEntry, "id">[]): Promise<void>;
  listPrefs(): Promise<Prefs[]>;
  setPrefs(facultyId: string, patch: Partial<Omit<Prefs, "facultyId" | "updatedAt">>): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
}

// ---------------- Supabase ----------------
function supabaseStore(url: string, key: string): Store {
  // Lazy import keeps the browser bundle free of supabase-js.
  let client: any;
  const sb = async () => {
    if (!client) {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(url, key, { auth: { persistSession: false } });
    }
    return client;
  };
  const must = (r: { data: any; error: any }): any => { if (r.error) throw new Error(r.error.message ?? String(r.error)); return r.data; };
  const rowToVersion = (r: any): Version => ({ id: r.id, status: r.status, createdAt: r.created_at, publishedAt: r.published_at ?? undefined, note: r.note ?? undefined, fileName: r.file_name ?? undefined, data: r.data, changes: r.changes ?? [], issues: r.issues ?? [], summary: r.summary });
  return {
    async listVersions() { return must(await (await sb()).from("versions").select("*").order("id", { ascending: false })).map(rowToVersion); },
    async listVersionSummaries(limit = 50) {
      const rows = must(await (await sb()).from("versions").select("id,status,created_at,published_at,note,file_name,changes,summary,faculty:data->faculty,semesters:data->semesters").order("id", { ascending: false }).limit(limit));
      return rows.map((r: any): VersionSummary => ({ id: r.id, status: r.status, createdAt: r.created_at, publishedAt: r.published_at ?? undefined, note: r.note ?? undefined, fileName: r.file_name ?? undefined, changes: r.changes ?? [], summary: r.summary, faculty: r.faculty ?? [], semesters: (r.semesters ?? []).map((x: any) => x.name) }));
    },
    async getVersion(id) { const rows = must(await (await sb()).from("versions").select("*").eq("id", id).limit(1)); return rows[0] ? rowToVersion(rows[0]) : null; },
    async getPublished() { const rows = must(await (await sb()).from("versions").select("*").eq("status", "published").order("id", { ascending: false }).limit(1)); return rows[0] ? rowToVersion(rows[0]) : null; },
    async createVersion(v) {
      const rows = must(await (await sb()).from("versions").insert({ status: v.status, created_at: v.createdAt, published_at: v.publishedAt ?? null, note: v.note ?? null, file_name: v.fileName ?? null, data: v.data, changes: v.changes, issues: v.issues, summary: v.summary }).select("*"));
      return rowToVersion(rows[0]);
    },
    async updateVersion(id, patch) {
      const row: any = {};
      if (patch.status) row.status = patch.status;
      if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt;
      if (patch.note !== undefined) row.note = patch.note;
      if (patch.changes) row.changes = patch.changes;
      if (patch.summary) row.summary = patch.summary;
      must(await (await sb()).from("versions").update(row).eq("id", id));
    },
    async listAcks(versionIds) {
      let q = (await sb()).from("acks").select("*");
      if (versionIds?.length) q = q.in("version_id", versionIds);
      return must(await q).map((r: any) => ({ versionId: r.version_id, facultyId: r.faculty_id, seenAt: r.seen_at }));
    },
    async addAck(a) { must(await (await sb()).from("acks").upsert({ version_id: a.versionId, faculty_id: a.facultyId, seen_at: a.seenAt }, { onConflict: "version_id,faculty_id" })); },
    async listAnnouncements() { return must(await (await sb()).from("announcements").select("*").order("id", { ascending: false })).map((r: any) => ({ id: r.id, createdAt: r.created_at, title: r.title, body: r.body, audience: r.audience, emailed: r.emailed, expiresAt: r.expires_at ?? undefined })); },
    async createAnnouncement(a) {
      const rows = must(await (await sb()).from("announcements").insert({ created_at: a.createdAt, title: a.title, body: a.body, audience: a.audience, emailed: a.emailed, expires_at: a.expiresAt ?? null }).select("*"));
      const r = rows[0];
      return { id: r.id, createdAt: r.created_at, title: r.title, body: r.body, audience: r.audience, emailed: r.emailed, expiresAt: r.expires_at ?? undefined };
    },
    async listEmailLog(limit = 500) { return must(await (await sb()).from("email_log").select("*").order("id", { ascending: false }).limit(limit)).map((r: any) => ({ id: r.id, createdAt: r.created_at, kind: r.kind, refId: r.ref_id, recipient: r.recipient, facultyId: r.faculty_id, subject: r.subject, status: r.status, providerId: r.provider_id ?? undefined, error: r.error ?? undefined })); },
    async addEmailLog(entries) {
      if (!entries.length) return;
      must(await (await sb()).from("email_log").insert(entries.map((e) => ({ created_at: e.createdAt, kind: e.kind, ref_id: e.refId, recipient: e.recipient, faculty_id: e.facultyId, subject: e.subject, status: e.status, provider_id: e.providerId ?? null, error: e.error ?? null }))));
    },
    async listPrefs() {
      return must(await (await sb()).from("prefs").select("*")).map((r: any) => ({ facultyId: r.faculty_id, dailyReminder: r.daily_reminder, changeEmails: r.change_emails, updatedAt: r.updated_at }));
    },
    async setPrefs(facultyId, patch) {
      const row: any = { faculty_id: facultyId, updated_at: new Date().toISOString() };
      if (patch.dailyReminder !== undefined) row.daily_reminder = patch.dailyReminder;
      if (patch.changeEmails !== undefined) row.change_emails = patch.changeEmails;
      must(await (await sb()).from("prefs").upsert(row, { onConflict: "faculty_id" }));
    },
    async getSettings() {
      const rows = must(await (await sb()).from("settings").select("*").eq("id", 1).limit(1));
      return { ...DEFAULT_SETTINGS, ...(rows[0]?.value ?? {}) };
    },
    async saveSettings(patch) {
      const current = await this.getSettings();
      const next = { ...current, ...patch };
      must(await (await sb()).from("settings").upsert({ id: 1, value: next }, { onConflict: "id" }));
      return next;
    },
  };
}

// ---------------- Local JSON file (development) ----------------
interface FileDb { versions: Version[]; acks: Ack[]; announcements: Announcement[]; emailLog: EmailLogEntry[]; prefs: Prefs[]; settings: Partial<Settings> }

function fileStore(path: string): Store {
  const empty: FileDb = { versions: [], acks: [], announcements: [], emailLog: [], prefs: [], settings: {} };
  const load = async (): Promise<FileDb> => {
    const fs = await import("node:fs/promises");
    try { return JSON.parse(await fs.readFile(path, "utf8")); } catch { return structuredClone(empty); }
  };
  const save = async (db: FileDb) => {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    await fs.mkdir(pathMod.dirname(path), { recursive: true });
    await fs.writeFile(path, JSON.stringify(db, null, 1));
  };
  const nextId = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  return {
    async listVersions() { return (await load()).versions.slice().sort((a, b) => b.id - a.id); },
    async listVersionSummaries(limit = 50) {
      return (await load()).versions.slice().sort((a, b) => b.id - a.id).slice(0, limit).map((v): VersionSummary => ({ id: v.id, status: v.status, createdAt: v.createdAt, publishedAt: v.publishedAt, note: v.note, fileName: v.fileName, changes: v.changes, summary: v.summary, faculty: v.data.faculty, semesters: v.data.semesters.map((s) => s.name) }));
    },
    async getVersion(id) { return (await load()).versions.find((v) => v.id === id) ?? null; },
    async getPublished() { return (await load()).versions.filter((v) => v.status === "published").sort((a, b) => b.id - a.id)[0] ?? null; },
    async createVersion(v) { const db = await load(); const row = { id: nextId(db.versions), ...v }; db.versions.push(row); await save(db); return row; },
    async updateVersion(id, patch) { const db = await load(); const i = db.versions.findIndex((v) => v.id === id); if (i >= 0) db.versions[i] = { ...db.versions[i], ...patch }; await save(db); },
    async listAcks(versionIds) { const db = await load(); return versionIds?.length ? db.acks.filter((a) => versionIds.includes(a.versionId)) : db.acks; },
    async addAck(a) { const db = await load(); db.acks = db.acks.filter((x) => !(x.versionId === a.versionId && x.facultyId === a.facultyId)); db.acks.push(a); await save(db); },
    async listAnnouncements() { return (await load()).announcements.slice().sort((a, b) => b.id - a.id); },
    async createAnnouncement(a) { const db = await load(); const row = { id: nextId(db.announcements), ...a }; db.announcements.push(row); await save(db); return row; },
    async listEmailLog(limit = 500) { return (await load()).emailLog.slice().sort((a, b) => b.id - a.id).slice(0, limit); },
    async addEmailLog(entries) { const db = await load(); let id = nextId(db.emailLog); for (const e of entries) db.emailLog.push({ id: id++, ...e }); await save(db); },
    async listPrefs() { return (await load()).prefs ?? []; },
    async setPrefs(facultyId, patch) {
      const db = await load(); db.prefs = db.prefs ?? [];
      const i = db.prefs.findIndex((p) => p.facultyId === facultyId);
      const base: Prefs = i >= 0 ? db.prefs[i] : { facultyId, dailyReminder: true, changeEmails: true, updatedAt: "" };
      const next = { ...base, ...patch, updatedAt: new Date().toISOString() };
      if (i >= 0) db.prefs[i] = next; else db.prefs.push(next);
      await save(db);
    },
    async getSettings() { return { ...DEFAULT_SETTINGS, ...((await load()).settings ?? {}) }; },
    async saveSettings(patch) { const db = await load(); db.settings = { ...DEFAULT_SETTINGS, ...(db.settings ?? {}), ...patch }; await save(db); return db.settings as Settings; },
  };
}

/** JUIT's Supabase project. Override with SUPABASE_URL if the project ever moves. */
const DEFAULT_SUPABASE_URL = "https://pnrbebxwyzopepdbqexc.supabase.co";

let singleton: Store | null = null;
export function getStore(): Store {
  if (singleton) return singleton;
  // The project URL is public information, so it has a default; the secret key never does.
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // On Vercel the project folder is read-only; only /tmp is writable, and it is wiped on
  // every deploy and not shared between instances. Fine for a first look, not for real use.
  const fallbackPath = process.env.LOCAL_DB_PATH ?? (process.env.VERCEL ? "/tmp/juit-timetable-db.json" : `${process.cwd()}/data/db.json`);
  singleton = url && key ? supabaseStore(url, key) : fileStore(fallbackPath);
  return singleton;
}

export function storeKind(): "supabase" | "local-file" | "ephemeral" {
  if ((process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  return process.env.VERCEL ? "ephemeral" : "local-file";
}
