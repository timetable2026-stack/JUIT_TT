// Browser-only preview: runs the real Portal and Admin components against an
// in-browser implementation of the API (localStorage), so the whole workflow can
// be tried without a server. Not part of the Vercel deployment.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Portal } from "../components/Portal";
import { Admin } from "../components/Admin";
import { parseSheets, templateSheets, workbookToCells, workbookToSheets } from "../lib/excel";
import { changesByFaculty, diffDatasets, summarize } from "../lib/diff";
import { icsForFaculty } from "../lib/format";
import { gridToSheets, looksLikeGrid, mergeFacultyDetails } from "../lib/grid";
import { buildExport, toWorkbook, type ExportKind } from "../lib/exportGrid";
import { dailyReminderEmail, istNow, slotsOnDay, withinTerm } from "../lib/reminders";
import { DEFAULT_SETTINGS, type Ack, type Announcement, type EmailLogEntry, type Prefs, type PublicPayload, type Settings, type Version } from "../lib/types";
import gridSource from "./grid-source.json";
import sampleV2 from "./sample-v2.json";

declare const XLSX: any;
declare const claude: any;
const SITE = { url: "https://timetable.juitsolan.ac.in", department: "Department of Computer Science & Engineering", institute: "Jaypee University of Information Technology, Solan" };
const DB_KEY = "tt_demo_db_v2";
const ADMIN_PW = "admin";
const TERM = { start: "2027-01-04", end: "2027-06-04", year: "2026-27" };
const hasXLSX = () => typeof XLSX !== "undefined" && !!XLSX?.utils;

interface Db { versions: Version[]; acks: Ack[]; announcements: Announcement[]; emailLog: EmailLogEntry[]; prefs: Prefs[]; settings: Partial<Settings>; admin: boolean }
const load = (): Db => { try { const d = JSON.parse(localStorage.getItem(DB_KEY) || "") as Db; d.prefs ??= []; d.settings ??= {}; return d; } catch { return { versions: [], acks: [], announcements: [], emailLog: [], prefs: [], settings: {}, admin: false }; } };
const save = (db: Db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
const nextId = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const settingsOf = (db: Db): Settings => ({ ...DEFAULT_SETTINGS, ...db.settings });
const livePublished = (db: Db) => db.versions.filter((v) => v.status === "published").sort((a, b) => b.id - a.id)[0] ?? null;

function publish(db: Db, data: Version["data"], opts: { note?: string; fileName?: string; issues: Version["issues"]; draftId?: number; sendEmail: boolean }) {
  const live = livePublished(db);
  const changes = diffDatasets(live?.data ?? null, data);
  const now = new Date().toISOString();
  let version: Version;
  if (opts.draftId) {
    version = db.versions.find((v) => v.id === opts.draftId)!;
    Object.assign(version, { status: "published", publishedAt: now, note: opts.note, changes, summary: summarize(data, changes) });
  } else {
    version = { id: nextId(db.versions), status: "published", createdAt: now, publishedAt: now, note: opts.note, fileName: opts.fileName, data, changes, issues: opts.issues, summary: summarize(data, changes) };
    db.versions.push(version);
  }
  if (live && live.id !== version.id) live.status = "superseded";
  const prefs = new Map(db.prefs.map((p) => [p.facultyId, p]));
  const recipients = opts.sendEmail ? (live ? data.faculty.filter((f) => changesByFaculty(changes).has(f.id)) : data.faculty).filter((f) => prefs.get(f.id)?.changeEmails !== false) : [];
  let id = nextId(db.emailLog);
  for (const f of recipients) db.emailLog.push({ id: id++, createdAt: now, kind: "publish", refId: version.id, recipient: f.email || "(no address)", facultyId: f.id, subject: live ? `Timetable update: ${changesByFaculty(changes).get(f.id)!.length} change(s) to your classes (v${version.id})` : "Timetable published: your classes", status: "skipped", error: f.email ? "Preview: no email is sent from the browser demo" : "No email address on file" });
  return { version, emails: { sent: 0, failed: 0, skipped: recipients.length, recipients: recipients.length } };
}

function planReminders(db: Db, at = new Date()) {
  const live = livePublished(db); const s = settingsOf(db); const { date, day, label } = istNow(at);
  const base = { date, day, label, skip: null as string | null, counts: { willEmail: 0, noClasses: 0, optedOut: 0, noEmail: 0 }, recipients: [] as { id: string; name: string; email: string; classes: number; subject: string; html: string }[] };
  if (!live) return { ...base, skip: "No timetable is published yet." };
  if (!s.reminderEnabled) return { ...base, skip: "Daily reminders are switched off in Settings." };
  if (!s.reminderDays.includes(day)) return { ...base, skip: `${day} is not a reminder day.` };
  if (s.holidays.includes(date)) return { ...base, skip: `${date} is marked as a holiday.` };
  if (!withinTerm(live.data, date)) return { ...base, skip: `Today is outside the semester dates (${live.data.semesters[0]?.startDate} to ${live.data.semesters[0]?.endDate}). In the preview, use the date box below to try a teaching day.` };
  const prefs = new Map(db.prefs.map((p) => [p.facultyId, p]));
  for (const f of live.data.faculty) {
    if (prefs.get(f.id)?.dailyReminder === false) { base.counts.optedOut++; continue; }
    const classes = slotsOnDay(live.data, f.id, day);
    if (classes.length === 0) { base.counts.noClasses++; continue; }
    const e = dailyReminderEmail({ data: live.data, faculty: f, day, dateLabel: label, siteUrl: SITE.url, department: SITE.department, announcements: db.announcements.filter((a) => a.audience.kind === "all").slice(0, 2) });
    base.recipients.push({ id: f.id, name: f.name, email: f.email, classes: classes.length, subject: e.subject, html: e.html });
    if (!f.email) base.counts.noEmail++; else base.counts.willEmail++;
  }
  base.counts.willEmail = base.recipients.filter((r) => r.email).length; // preview lists everyone so messages can be read, but only addresses count
  return base;
}

function sheetsFromUpload(bytes: Uint8Array, live: Version | null) {
  // Preview payloads: '[' = raw grid cells, '{' = row-format sheets. Otherwise a real .xlsx via SheetJS.
  let cells: { name: string; cells: string[][] }[] | null = null;
  let sheets: any = null;
  if (bytes[0] === 0x5b) cells = JSON.parse(new TextDecoder().decode(bytes));
  else if (bytes[0] === 0x7b) sheets = JSON.parse(new TextDecoder().decode(bytes));
  else if (hasXLSX()) { const wb = XLSX.read(bytes, { type: "array", cellDates: true }); cells = workbookToCells(XLSX, wb); if (wb.SheetNames.some((n: string) => n.trim().toLowerCase() === "timetable")) sheets = workbookToSheets(XLSX, wb); }
  else throw new Error("The spreadsheet library could not load in this preview, so a real .xlsx cannot be read here. Use the buttons in the yellow bar; the deployed site reads .xlsx normally.");
  let conversion: any = null;
  if (!sheets && cells) {
    const gridSheets = cells.filter(looksLikeGrid);
    if (!gridSheets.length) throw new Error(`No "Timetable" sheet and no day-by-period grid found. Sheets: ${cells.map((c) => c.name).join(", ")}.`);
    const term = live?.data.semesters[0] ? { start: live.data.semesters[0].startDate, end: live.data.semesters[0].endDate, year: live.data.semesters[0].academicYear } : TERM;
    const g = gridToSheets(cells, term);
    const merged = mergeFacultyDetails(g.sheets.Faculty ?? [], live?.data.faculty ?? []);
    g.sheets.Faculty = merged.rows; sheets = g.sheets;
    conversion = { used: true, groups: g.groups, report: g.report, notes: g.notes.slice(0, 40), carriedFaculty: merged.carried };
  }
  return { sheets, conversion };
}

async function saveWorkbook(fileName: string, wb: any) {
  if (!hasXLSX()) { toast("The spreadsheet library did not load in this preview, so Excel files cannot be built here. The deployed site serves them directly."); return; }
  const buf: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  try {
    const dl = typeof claude !== "undefined" && claude?.use ? await claude.use("downloads") : null;
    if (dl) { await dl.save({ filename: fileName, data: buf }); toast(`Saved ${fileName}`); return; }
  } catch (e: any) { if (e?.code === "declined") return; }
  // Outside the claude.ai frame (e.g. the standalone file), a normal download works.
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = fileName; a.click();
}

function toast(msg: string) {
  let t = document.getElementById("toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "show"; setTimeout(() => (t!.className = ""), 3200);
}

function downloadWorkbook(which: string, db: Db) {
  if (!hasXLSX()) return toast("Excel download is unavailable in this preview; it works on the deployed site.");
  const wb = XLSX.utils.book_new();
  if (which === "current") {
    const live = livePublished(db); if (!live) return toast("Nothing published yet");
    const d = live.data;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Semester", "Section", "Day", "Period", "Start", "End", "Subject code", "Subject name", "Type", "Faculty ID", "Room", "Batch", "Notes"], ...d.slots.map((s) => [s.semester, s.section, s.day, s.period, s.start ?? "", s.end ?? "", s.subjectCode, s.subjectName, s.type, s.facultyIds.join(";"), s.room, s.batch ?? "", s.notes ?? ""])]), "Timetable");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Faculty ID", "Full name", "Email", "Department", "Designation", "Phone", "Role"], ...d.faculty.map((f) => [f.id, f.name, f.email, f.department ?? "", f.designation ?? "", f.phone ?? "", f.role])]), "Faculty");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Period", "Start", "End", "Break", "Label"], ...d.periods.map((p) => [p.number, p.start, p.end, p.isBreak ? "Yes" : "", p.label ?? ""])]), "Periods");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Semester", "Start date", "End date", "Academic year", "Exam window"], ...d.semesters.map((s) => [s.name, s.startDate, s.endDate, s.academicYear ?? "", s.examWindow ?? ""])]), "Semesters");
    saveWorkbook(`Timetable_v${live.id}.xlsx`, wb);
  } else {
    for (const [sheet, rows] of Object.entries(templateSheets())) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
    saveWorkbook("Timetable_Template.xlsx", wb);
  }
}

window.confirm = () => true;
window.alert = (m?: any) => toast(String(m));

/** Preview-only: push a payload through the admin's own file input so the real UI flow runs. */
async function simulateUpload(payload: string, fileName: string) {
  const db = load(); db.admin = true; save(db);
  location.hash = "#admin";
  for (let i = 0; i < 60; i++) {
    const b = [...document.querySelectorAll("nav.sidenav button")].find((x) => x.textContent?.startsWith("Upload")) as HTMLButtonElement | undefined;
    if (b) { b.click(); break; }
    await new Promise((r) => setTimeout(r, 100));
  }
  let input: HTMLInputElement | null = null;
  for (let i = 0; i < 60 && !input; i++) { input = document.querySelector("input[type=file]"); if (!input) await new Promise((r) => setTimeout(r, 100)); }
  if (!input) return;
  const dt = new DataTransfer(); dt.items.add(new File([payload], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("/api/")) return realFetch(input, init);
  const db = load();
  const body = init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : {};
  const u = new URL(url, "http://x"); const path = u.pathname;
  try {
    if (path === "/api/timetable") {
      const live = livePublished(db);
      const recent = db.versions.filter((v) => v.status !== "draft").sort((a, b) => b.id - a.id).slice(0, 8);
      const payload: PublicPayload = { version: live ? { id: live.id, publishedAt: live.publishedAt!, note: live.note } : null, data: live?.data ?? null, changes: live?.changes ?? [], recentPublishes: recent.map((v) => ({ id: v.id, publishedAt: v.publishedAt!, note: v.note, changes: v.changes })), announcements: db.announcements.filter((a) => !a.expiresAt || Date.parse(a.expiresAt) > Date.now()).sort((a, b) => b.id - a.id), acks: db.acks, prefs: db.prefs, settings: settingsOf(db), site: SITE };
      return json(payload);
    }
    if (path === "/api/ack") { db.acks = db.acks.filter((a) => !(a.versionId === body.versionId && a.facultyId === body.facultyId)); db.acks.push({ versionId: body.versionId, facultyId: body.facultyId, seenAt: new Date().toISOString() }); save(db); return json({ ok: true }); }
    if (path === "/api/prefs") {
      const i = db.prefs.findIndex((p) => p.facultyId === body.facultyId);
      const base: Prefs = i >= 0 ? db.prefs[i] : { facultyId: body.facultyId, dailyReminder: true, changeEmails: true, updatedAt: "" };
      const next = { ...base, ...(typeof body.dailyReminder === "boolean" ? { dailyReminder: body.dailyReminder } : {}), ...(typeof body.changeEmails === "boolean" ? { changeEmails: body.changeEmails } : {}), updatedAt: new Date().toISOString() };
      if (i >= 0) db.prefs[i] = next; else db.prefs.push(next); save(db); return json({ ok: true, prefs: db.prefs });
    }
    if (path === "/api/admin/login") { if (body.password !== ADMIN_PW) return json({ error: `Incorrect password (the preview password is "${ADMIN_PW}")` }, 401); db.admin = true; save(db); return json({ ok: true }); }
    if (path === "/api/admin/logout") { db.admin = false; save(db); return json({ ok: true }); }
    if (!db.admin) return json({ admin: false }, path === "/api/admin/status" ? 200 : 401);
    if (path === "/api/admin/status") return json({ admin: true, config: { store: "browser preview (this device only)", email: false, from: null, cron: false, site: SITE }, versions: db.versions.slice().sort((a, b) => b.id - a.id).map((v) => ({ id: v.id, status: v.status, createdAt: v.createdAt, publishedAt: v.publishedAt, note: v.note, fileName: v.fileName, summary: v.summary, changes: v.changes, issues: v.issues, faculty: v.data.faculty, semesters: v.data.semesters.map((s) => s.name) })), emailLog: db.emailLog.slice().sort((a, b) => b.id - a.id), announcements: db.announcements.slice().sort((a, b) => b.id - a.id), acks: db.acks, prefs: db.prefs, settings: settingsOf(db) });
    if (path === "/api/admin/upload") {
      const file = (init!.body as FormData).get("file") as File;
      const live = livePublished(db);
      const { sheets, conversion } = sheetsFromUpload(new Uint8Array(await file.arrayBuffer()), live);
      const parsed = parseSheets(sheets);
      const changes = parsed.ok ? diffDatasets(live?.data ?? null, parsed.data) : [];
      let draftId: number | null = null;
      if (parsed.ok) { draftId = nextId(db.versions); db.versions.push({ id: draftId, status: "draft", createdAt: new Date().toISOString(), fileName: file.name, data: parsed.data, changes, issues: parsed.issues, summary: summarize(parsed.data, changes) }); save(db); }
      return json({ ok: parsed.ok, draftId, fileName: file.name, issues: parsed.issues, changes, byFaculty: Object.fromEntries([...changesByFaculty(changes)].map(([f, cs]) => [f, cs.map((c) => c.id)])), summary: parsed.ok ? summarize(parsed.data, changes) : null, isFirstPublish: !live, conversion, data: parsed.ok ? parsed.data : null });
    }
    if (path === "/api/admin/publish") { const d = db.versions.find((v) => v.id === body.draftId && v.status === "draft"); if (!d) return json({ error: "Draft not found" }, 404); const r = publish(db, d.data, { note: body.note, fileName: d.fileName, issues: d.issues, draftId: d.id, sendEmail: body.sendEmail !== false }); save(db); return json({ ok: true, versionId: r.version.id, summary: r.version.summary, emails: r.emails }); }
    if (path === "/api/admin/rollback") { const t = db.versions.find((v) => v.id === body.versionId); if (!t) return json({ error: "Not found" }, 404); const r = publish(db, t.data, { note: body.note ?? `Rolled back to version ${t.id}`, fileName: t.fileName, issues: t.issues, sendEmail: true }); save(db); return json({ ok: true, versionId: r.version.id, summary: r.version.summary, emails: r.emails }); }
    if (path === "/api/admin/announce") { const a: Announcement = { id: nextId(db.announcements), createdAt: new Date().toISOString(), title: body.title, body: body.body, audience: body.audience ?? { kind: "all" }, emailed: !!body.email, expiresAt: body.expiresAt }; db.announcements.push(a); save(db); const n = body.email ? (livePublished(db)?.data.faculty.length ?? 0) : 0; return json({ ok: true, announcement: a, emails: { sent: 0, failed: 0, skipped: n, recipients: n } }); }
    if (path === "/api/admin/resend") { const v = db.versions.find((x) => x.id === body.versionId); if (!v) return json({ error: "Not found" }, 404); const seen = new Set(db.acks.filter((a) => a.versionId === v.id).map((a) => a.facultyId)); const targets = (v.changes.length ? v.data.faculty.filter((f) => changesByFaculty(v.changes).has(f.id)) : v.data.faculty).filter((f) => !seen.has(f.id)); let id = nextId(db.emailLog); for (const f of targets) db.emailLog.push({ id: id++, createdAt: new Date().toISOString(), kind: "reminder", refId: v.id, recipient: f.email || "(no address)", facultyId: f.id, subject: "Reminder: timetable changes", status: "skipped", error: "Preview mode" }); save(db); return json({ ok: true, recipients: targets.length, sent: 0, skipped: targets.length, failed: 0 }); }
    if (path === "/api/admin/reminders" && (!init?.method || init.method === "GET")) {
      const dateParam = u.searchParams.get("date") || (window as any).__previewDate;
      const plan = planReminders(db, dateParam ? new Date(`${dateParam}T06:00:00+05:30`) : new Date());
      const pf = u.searchParams.get("preview"); const pick = pf ? plan.recipients.find((r) => r.id === pf) : plan.recipients[0];
      return json({ date: plan.date, day: plan.day, label: plan.label, skip: plan.skip, counts: plan.counts, recipients: plan.recipients.map(({ html, ...r }) => r), preview: pick ? { id: pick.id, name: pick.name, subject: pick.subject, html: pick.html } : null });
    }
    if (path === "/api/admin/reminders") {
      if (body.action === "settings") { const { action, ...patch } = body; db.settings = { ...settingsOf(db), ...patch }; save(db); return json({ ok: true, settings: settingsOf(db) }); }
      if (body.action === "send") { const plan = planReminders(db, (window as any).__previewDate ? new Date(`${(window as any).__previewDate}T06:00:00+05:30`) : new Date()); let id = nextId(db.emailLog); for (const r of plan.recipients) db.emailLog.push({ id: id++, createdAt: new Date().toISOString(), kind: "daily", refId: Number(plan.date.replace(/-/g, "")), recipient: r.email || "(no address)", facultyId: r.id, subject: r.subject, status: "skipped", error: r.email ? "Preview: no email is sent from the browser demo" : "No email address on file" }); save(db); return json({ ok: true, skip: plan.skip, planned: plan.recipients.length, sent: 0, failed: 0, skipped: plan.recipients.length }); }
    }
    if (path === "/api/admin/versions") { const id = Number(u.searchParams.get("id")); return json(db.versions.find((v) => v.id === id) ?? { error: "Not found" }); }
    return json({ error: "Unknown route " + path }, 404);
  } catch (e: any) { return json({ error: String(e?.message ?? e) }, 500); }
};

document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (a.dataset.export) {
    e.preventDefault();
    const live = livePublished(load()); if (!live) return toast("Nothing published yet");
    if (!hasXLSX()) return toast("Excel download is unavailable in this preview; on the deployed site this button serves the file directly.");
    const ex = buildExport(live.data, { kind: a.dataset.export as ExportKind, id: a.dataset.exportId! }, live.id);
    saveWorkbook(ex.fileName, toWorkbook(XLSX, ex));
  }
  else if (href.startsWith("/api/admin/template")) { e.preventDefault(); downloadWorkbook(new URL(href, "http://x").searchParams.get("which") ?? "template", load()); }
  else if (href === "/admin") { e.preventDefault(); location.hash = "#admin"; }
  else if (href === "/") { e.preventDefault(); location.hash = "#portal"; }
  else if (href.startsWith("/api/ics/")) { e.preventDefault(); const live = livePublished(load()); if (live) { const fid = href.split("/").pop()!; const ics = icsForFaculty(live.data, fid, "Timetable", live.id); navigator.clipboard?.writeText(ics).then(() => toast("Calendar data copied; on the deployed site this link subscribes your calendar.")).catch(() => toast("On the deployed site this link subscribes your calendar.")); } }
  else if (href.startsWith("mailto:")) { /* leave */ }
});

function DemoBar({ onChange }: { onChange: () => void }) {
  const [hash, setHash] = useState(location.hash);
  const [date, setDate] = useState<string>((window as any).__previewDate ?? "");
  useEffect(() => { const h = () => setHash(location.hash); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const isAdmin = hash === "#admin";
  const publishGrid = () => {
    const db = load();
    const { sheets } = sheetsFromUpload(new TextEncoder().encode(JSON.stringify(gridSource)), null);
    const p = parseSheets(sheets);
    publish(db, p.data, { issues: p.issues, fileName: "Timetable_Jan_Jun_2027.xlsx", note: "Timetable for January–June 2027 published. Please check your classes and report any clash to the office.", sendEmail: true });
    save(db); onChange(); toast("Published from the original grid-format master file.");
  };
  const reset = () => { localStorage.removeItem(DB_KEY); try { localStorage.removeItem("tt_fid"); } catch {} (window as any).__previewDate = undefined; onChange(); };
  return (
    <div className="demo-bar">
      <div><b>Preview — real JUIT data, Jan–Jun 2027.</b> Runs in your browser and saves to this device only; the deployed site shares one database and sends real email.</div>
      <div className="row">
        <button className="btn sm" onClick={() => (location.hash = isAdmin ? "#portal" : "#admin")}>{isAdmin ? "→ Faculty portal" : "→ Office admin (password: admin)"}</button>
        <button className="btn sm primary" onClick={publishGrid}>1 · Publish the timetable</button>
        <button className="btn sm" onClick={() => simulateUpload(JSON.stringify(gridSource), "Timetable_Jan_Jun_2027.xlsx")}>2 · Upload the original master file</button>
        <button className="btn sm" onClick={() => simulateUpload(JSON.stringify(sampleV2), "Timetable_Jan_Jun_2027_rev2.xlsx")}>3 · Upload a revised sheet (25 changes)</button>
        <label className="small row" style={{ gap: 4 }}>Pretend today is <input type="date" value={date} onChange={(e) => { setDate(e.target.value); (window as any).__previewDate = e.target.value || undefined; onChange(); }} style={{ width: "auto", padding: "4px 6px" }} /></label>
        <button className="btn sm" onClick={reset}>Reset</button>
      </div>
    </div>
  );
}

function App() {
  const [hash, setHash] = useState(location.hash);
  const [key, setKey] = useState(0);
  useEffect(() => { const h = () => setHash(location.hash); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  return (
    <>
      <DemoBar onChange={() => setKey((k) => k + 1)} />
      {hash === "#admin" ? <Admin key={"a" + key} /> : <Portal key={"p" + key} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
