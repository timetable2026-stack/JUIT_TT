"use client";
import { useEffect, useMemo, useState } from "react";
import type { Ack, Announcement, Change, Dataset, EmailLogEntry, Faculty, Issue, Prefs, Settings } from "@/lib/types";
import { ChangeRow } from "./Portal";
import { TimetableGrid, changedKeys, fmtDate } from "./shared";
import { ThemeToggle } from "./ThemeToggle";
import { LoadingScreen } from "./LoadingScreen";
import { Statistics } from "./Statistics";

interface VersionRow { id: number; status: string; createdAt: string; publishedAt?: string; note?: string; fileName?: string; summary: { slots: number; faculty: number; changes: number; affectedFaculty: number }; changes: Change[]; issues: Issue[]; faculty: Faculty[]; semesters: string[] }
interface Status { admin: boolean; config?: { store: string; email: boolean; transport?: string; from: string | null; cron: boolean; site: { url: string; department: string; institute: string } }; versions?: VersionRow[]; emailLog?: EmailLogEntry[]; announcements?: Announcement[]; acks?: Ack[]; prefs?: Prefs[]; settings?: Settings }
interface Conversion { used: boolean; groups: string[]; report: { sheet: string; day: string; classes: number }[]; notes: string[]; carriedFaculty: number }
interface UploadResult { ok: boolean; draftId: number | null; fileName: string; issues: Issue[]; changes: Change[]; byFaculty: Record<string, string[]>; summary: { slots: number; faculty: number; changes: number; affectedFaculty: number } | null; isFirstPublish: boolean; conversion: Conversion | null; data: Dataset | null; error?: string }

type Section = "overview" | "upload" | "stats" | "reminders" | "announce" | "versions" | "reach" | "people" | "email" | "settings";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export function Admin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const reload = () => api<Status>("/api/admin/status").then(setStatus).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, []);

  if (!status) return <AdminShell><LoadingScreen message="Opening the TTC admin…" /></AdminShell>;
  if (!status.admin) return (
    <AdminShell>
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="card">
          <h2>TTC sign-in</h2>
          <p className="muted small">Only the Time Table Committee signs in. Faculty open the portal without a password.</p>
          <form onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) }); setPw(""); reload(); } catch (x: any) { setErr(x.message); } }} className="stack">
            <input id="admin-password" type="password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            {err && <div className="notice bad small">{err}</div>}
            <button className="btn primary" type="submit">Sign in</button>
            <a className="small" href="/">← Back to the portal</a>
          </form>
        </div>
      </div>
    </AdminShell>
  );

  const live = status.versions?.find((v) => v.status === "published") ?? null;
  const nav: [Section, string][] = [["overview", "Overview"], ["upload", "Upload & publish"], ["stats", "Load & statistics"], ["reminders", "Daily reminders"], ["announce", "Announcements"], ["reach", "Who has seen it"], ["versions", "Versions & rollback"], ["people", "People"], ["email", "Email log"], ["settings", "Setup"]];

  return (
    <AdminShell right={<><a className="btn sm" href="/" target="_blank">Open portal ↗</a><button className="btn sm" onClick={async () => { await api("/api/admin/logout", { method: "POST" }); reload(); }}>Sign out</button></>}>
      <div className="container sidebar-layout">
        <nav className="sidenav">{nav.map(([k, l]) => <button key={k} className={section === k ? "active" : ""} onClick={() => setSection(k)}>{l}</button>)}</nav>
        <main className="stack">
          {err && <div className="notice bad">{err}</div>}
          {section === "overview" && <Overview status={status} live={live} go={setSection} />}
          {section === "upload" && <Upload live={live} onPublished={() => { reload(); setSection("reach"); }} />}
          {section === "stats" && (live ? <Statistics /> : <div className="card muted">Publish a timetable first; statistics are computed from the live version.</div>)}
          {section === "reminders" && <Reminders status={status} live={live} onDone={reload} />}
          {section === "announce" && <Announce live={live} anns={status.announcements ?? []} onDone={reload} />}
          {section === "versions" && <Versions versions={status.versions ?? []} onDone={reload} />}
          {section === "reach" && <Reach versions={status.versions ?? []} acks={status.acks ?? []} onDone={reload} />}
          {section === "people" && <People live={live} acks={status.acks ?? []} prefs={status.prefs ?? []} />}
          {section === "email" && <EmailLog log={status.emailLog ?? []} />}
          {section === "settings" && <Setup status={status} />}
        </main>
      </div>
    </AdminShell>
  );
}

function AdminShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <>
      <header className="topbar"><div className="topbar-inner"><div className="brand"><div className="brand-mark">TT</div><div><h1>Time Table Committee</h1><div className="sub">Upload · review · publish · remind</div></div></div><div className="topbar-actions">{right}</div></div></header>
      <main id="main">{children}</main>
      <ThemeToggle />
    </>
  );
}

// ---------------------------------------------------------------- Overview
function Overview({ status, live, go }: { status: Status; live: VersionRow | null; go: (s: Section) => void }) {
  const c = status.config!;
  const unseen = live ? live.faculty.filter((f) => (live.changes.length === 0 || live.changes.some((ch) => ch.affectedFacultyIds.includes(f.id))) && !status.acks?.some((a) => a.versionId === live.id && a.facultyId === f.id)).length : 0;
  const noEmail = live ? live.faculty.filter((f) => !f.email).length : 0;
  const setup = [
    { ok: true, label: "Website is live", sub: c.site.url },
    { ok: !!live, label: live ? `Timetable published (version ${live.id})` : "Publish the first timetable", sub: live ? `${live.summary.slots} classes · ${live.summary.faculty} faculty` : "Upload the master Excel — the original grid file works as-is", act: live ? undefined : () => go("upload") },
    { ok: c.store === "supabase", label: c.store === "supabase" ? "Database connected" : c.store === "ephemeral" ? "Database not connected — data is temporary" : "Database: local file (development only)", sub: c.store === "supabase" ? "Supabase" : c.store === "ephemeral" ? "Everything published is lost on the next deploy. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then redeploy." : "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before going live", act: c.store === "supabase" ? undefined : () => go("settings") },
    { ok: c.email, label: c.email ? `Email on · ${c.from}` : "Email not configured", sub: c.email ? `Sent ${c.transport === "smtp" ? "from the office mailbox" : "via Resend"}; change alerts and morning reminders go out` : "Set SMTP_USER and SMTP_PASS for the office mailbox; until then emails are logged as skipped", act: () => go("settings") },
    { ok: noEmail === 0 && !!live, label: live ? (noEmail === 0 ? "Every faculty member has an email" : `${noEmail} faculty without an email address`) : "Faculty emails", sub: noEmail ? "Fill the Email column of the Faculty sheet and re-upload, or edit People" : "Nobody will miss an alert", act: noEmail ? () => go("people") : undefined },
    { ok: c.cron, label: c.cron ? "Morning reminders scheduled" : "Morning reminder schedule", sub: c.cron ? `Daily at ${String(status.settings?.reminderHour ?? 7).padStart(2, "0")}:00 IST` : "Set CRON_SECRET in Vercel so the 07:00 run can authenticate", act: c.cron ? () => go("reminders") : () => go("settings") },
  ];
  return (
    <>
      <div className="card">
        <div className="row between">
          <div><h2>{live ? `Live: version ${live.id}` : "Nothing published yet"}</h2>
            {c.store === "ephemeral" && <div className="notice warn small" style={{ marginBottom: 10 }}><b>Temporary storage.</b> The database is not connected yet, so anything you publish now disappears at the next deploy. Fine for trying the site; connect Supabase before the department relies on it (Setup → Database).</div>}
        {live ? <p className="muted small" style={{ margin: "4px 0 0" }}>Published {fmtDate(live.publishedAt)} from <b>{live.fileName}</b>{live.note ? ` · “${live.note}”` : ""}</p> : <p className="muted small" style={{ margin: "4px 0 0" }}>Upload the semester Excel to publish the first version. Your existing grid-format master file can be uploaded directly.</p>}</div>
          <button className="btn primary" onClick={() => go("upload")}>{live ? "Upload a revised timetable" : "Upload the timetable"}</button>
        </div>
        <div className="grid stats" style={{ marginTop: 14 }}>
          <div className="stat"><div className="n">{live?.summary.slots ?? 0}</div><div className="l">class slots</div></div>
          <div className="stat"><div className="n">{live?.summary.faculty ?? 0}</div><div className="l">faculty</div></div>
          <div className="stat"><div className="n">{live?.summary.changes ?? 0}</div><div className="l">changes in last publish</div></div>
          <div className="stat"><div className="n">{unseen}</div><div className="l">not yet seen it</div></div>
        </div>
        {live && <div className="row" style={{ marginTop: 12 }}>
          <span className="muted small">Download in the TTC layout:</span>
          <a className="btn sm" href="/api/export?kind=faculty&id=all" data-export="faculty" data-export-id="all" download>⬇ All faculty</a>
          <a className="btn sm" href="/api/export?kind=section&id=all" data-export="section" data-export-id="all" download>⬇ All sections</a>
          <a className="btn sm" href="/api/export?kind=room&id=all" data-export="room" data-export-id="all" download>⬇ All rooms</a>
        </div>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => go("announce")}>Post an announcement</button>
          <button className="btn" onClick={() => go("reminders")}>Today's reminders</button>
          <button className="btn" onClick={() => go("stats")}>Load &amp; statistics</button>
          <a className="btn" href="/api/admin/template?which=template">Blank template</a>
          {live && <a className="btn" href="/api/admin/template?which=current">Current timetable as Excel</a>}
        </div>
      </div>
      <div className="card">
        <h3>Setup checklist</h3>
        <div className="checklist">
          {setup.map((s, i) => <div key={i} className={`check-item ${s.ok ? "ok" : "todo"}`}><span className="dot" /><div><b>{s.label}</b><small>{s.sub}</small></div>{s.act && <button className="btn sm" onClick={s.act}>{s.ok ? "Open" : "Fix"}</button>}</div>)}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Upload
function Upload({ live, onPublished }: { live: VersionRow | null; onPublished: () => void }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<UploadResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState<{ versionId: number; emails: { sent: number; failed: number; skipped: number; recipients: number } } | null>(null);
  const [view, setView] = useState<"faculty" | "class" | "all">("faculty");
  const [confirming, setConfirming] = useState(false);

  const upload = async (file: File) => {
    setBusy("Reading the workbook…"); setErr(null); setRes(null); setDone(null); setConfirming(false);
    try { const fd = new FormData(); fd.append("file", file); setRes(await api<UploadResult>("/api/admin/upload", { method: "POST", body: fd })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const publish = async () => {
    if (!res?.draftId) return;
    setBusy("Publishing…"); setErr(null);
    try { const r = await api<any>("/api/admin/publish", { method: "POST", body: JSON.stringify({ draftId: res.draftId, note, sendEmail }) }); setDone(r); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); setConfirming(false); }
  };

  const errors = res?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = res?.issues.filter((i) => i.level === "warning") ?? [];
  const facById = new Map((res?.data?.faculty ?? live?.faculty ?? []).map((f) => [f.id, f]));
  const byFaculty = Object.entries(res?.byFaculty ?? {}).map(([fid, ids]) => ({ fid, name: facById.get(fid)?.name ?? fid, changes: (res?.changes ?? []).filter((c) => ids.includes(c.id)) })).sort((a, b) => b.changes.length - a.changes.length);
  const byClass = useMemo(() => { const m = new Map<string, Change[]>(); for (const c of res?.changes ?? []) { const s = c.after ?? c.before; const k = s ? `${s.semester}${s.section ? " " + s.section : ""}` : "Department"; m.set(k, [...(m.get(k) ?? []), c]); } return [...m].sort(); }, [res]);
  const bigChange = !!(live && res?.summary && res.summary.changes > Math.max(20, live.summary.slots * 0.4));
  const step = done ? 4 : res?.ok ? 3 : res ? 2 : 1;

  if (done) return (
    <>
      <Stepper step={5} />
      <div className="card">
        <h2>Published version {done.versionId} ✓</h2>
        <p>The portal is updated and every affected faculty member's Alerts tab shows their changes.</p>
        <p className="small">Email: <b>{done.emails.sent} sent</b>{done.emails.failed ? `, ${done.emails.failed} failed` : ""}{done.emails.skipped ? `, ${done.emails.skipped} skipped (email not configured or no address)` : ""} of {done.emails.recipients} recipient{done.emails.recipients === 1 ? "" : "s"}.</p>
        <div className="row"><button className="btn primary" onClick={onPublished}>See who has seen it</button><button className="btn" onClick={() => { setDone(null); setRes(null); }}>Upload another file</button></div>
      </div>
    </>
  );

  return (
    <>
      <Stepper step={step} />
      <div className="card">
        <h2>Upload the Excel</h2>
        <p className="muted small">Drop the file you already maintain. Both layouts work: the <b>grid-format master</b> (one sheet per year, days down, periods across) and the <b>row-format template</b>. The site works out which it is.</p>
        <label className={`drop ${drag ? "active" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}>
          <input id="upload-file" type="file" accept=".xlsx,.xlsm,.xls" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
          {busy ? <span><span className="spinner" /> {busy}</span> : <><b>Drop the .xlsx here</b> or click to choose a file</>}
        </label>
        <div className="row small muted" style={{ marginTop: 8 }}>
          <a href="/api/admin/template?which=template">Blank row-format template</a>
          {live && <>· <a href="/api/admin/template?which=current">Current timetable as Excel</a> (edit and re-upload)</>}
        </div>
        {err && <div className="notice bad" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {res && (
        <div className="card">
          <h2>Check — {res.fileName}</h2>
          {res.conversion?.used && (
            <div className="notice info small">
              <b>Read as a grid-format master.</b> Converted {res.conversion.groups.length} year group{res.conversion.groups.length === 1 ? "" : "s"} ({res.conversion.groups.join(", ")}) into {res.summary?.slots ?? 0} classes.
              {res.conversion.carriedFaculty > 0 && <> Kept names and emails already on file for {res.conversion.carriedFaculty} faculty.</>}
              {res.conversion.notes.length > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer" }}>{res.conversion.notes.length} cell{res.conversion.notes.length === 1 ? "" : "s"} skipped</summary><ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{res.conversion.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
            </div>
          )}
          {res.ok
            ? <div className="notice good small" style={{ marginTop: 8 }}><b>No blocking errors.</b> {res.summary!.slots} class slots, {res.summary!.faculty} faculty.{warnings.length ? ` ${warnings.length} warning${warnings.length === 1 ? "" : "s"} below — worth a look, not blocking.` : ""}</div>
            : <div className="notice bad small" style={{ marginTop: 8 }}><b>{errors.length} problem{errors.length === 1 ? "" : "s"} to fix in the Excel</b> before this file can be published. Nothing has changed on the portal. Each line says the sheet, row and what to change.</div>}
          {(errors.length > 0 || warnings.length > 0) && <IssueList issues={[...errors, ...warnings]} />}
        </div>
      )}

      {res?.ok && (
        <div className="card">
          <h2>Review {res.isFirstPublish ? "" : `— ${res.summary!.changes} change${res.summary!.changes === 1 ? "" : "s"} affecting ${res.summary!.affectedFaculty} faculty`}</h2>
          {res.isFirstPublish ? <div className="notice info small">First publish of the semester. Every faculty member with an email receives the full timetable and their personal link.</div>
            : res.changes.length === 0 ? <div className="notice info small">Identical to the live version. Publishing creates a new version number but alerts nobody.</div> : (
              <>
                <div className="tabs" style={{ margin: "8px 0" }}>
                  <button className={`tab ${view === "faculty" ? "active" : ""}`} onClick={() => setView("faculty")}>By faculty ({byFaculty.length})</button>
                  <button className={`tab ${view === "class" ? "active" : ""}`} onClick={() => setView("class")}>By class ({byClass.length})</button>
                  <button className={`tab ${view === "all" ? "active" : ""}`} onClick={() => setView("all")}>All changes</button>
                </div>
                {view === "all" && <div className="alert-group">{res.changes.map((c) => <ChangeRow key={c.id} c={c} />)}</div>}
                {view === "faculty" && byFaculty.map((g) => (
                  <div className="alert-group" key={g.fid} style={{ marginBottom: 8 }}>
                    <div className="alert-head"><b>{g.name}</b><div className="row"><span className="muted small">{g.changes.length} change{g.changes.length === 1 ? "" : "s"} · {facById.get(g.fid)?.email || "no email on file"}</span><button className="btn sm" onClick={() => setPreview(preview === g.fid ? null : g.fid)}>{preview === g.fid ? "Hide email" : "Preview email"}</button></div></div>
                    {preview === g.fid && <div className="alert-note" style={{ background: "var(--card-2)", color: "inherit" }}><b>Subject:</b> Timetable update: {g.changes.length} change{g.changes.length === 1 ? "" : "s"} to your classes<br /><b>To:</b> {facById.get(g.fid)?.email || "— (not sent: no address)"}<br /><span className="small muted">Lists the changes below, your note, a “View and mark as seen” button and the updated weekly grid.</span></div>}
                    {g.changes.map((c) => <ChangeRow key={c.id} c={c} />)}
                  </div>
                ))}
                {view === "class" && byClass.map(([k, cs]) => <div className="alert-group" key={k} style={{ marginBottom: 8 }}><div className="alert-head"><b>{k}</b><span className="muted small">{cs.length} change{cs.length === 1 ? "" : "s"}</span></div>{cs.map((c) => <ChangeRow key={c.id} c={c} />)}</div>)}
              </>
            )}
          {res.data && <details style={{ marginTop: 10 }}><summary className="muted small" style={{ cursor: "pointer" }}>Preview the new timetable grid</summary><GridPreview data={res.data} changes={res.changes} /></details>}
        </div>
      )}

      {res?.ok && (
        <div className="card">
          <h2>Publish</h2>
          <div className="stack">
            <div><label className="field" htmlFor="publish-note">Note shown with the alert and in the email (optional)</label><input id="publish-note" type="text" placeholder='e.g. "CR13 closed for repair until 20 Jan; those classes moved to CR16"' value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></div>
            <label className="row small"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email {res.isFirstPublish ? "all faculty" : "the affected faculty"} now (the Alerts tab updates either way)</label>
            {bigChange && <div className="notice warn small"><b>Large change:</b> {res.summary!.changes} changes touch {res.summary!.affectedFaculty} faculty — a big share of the timetable. Double-check this is the right file before publishing.</div>}
            {!confirming
              ? <div className="row"><button className="btn primary" disabled={!!busy} onClick={() => setConfirming(true)}>{res.isFirstPublish ? "Publish version 1" : "Publish changes"}</button><span className="muted small">Goes live at once. Any version can be rolled back later.</span></div>
              : <div className="notice info row between"><span>{res.isFirstPublish ? `Publish and email all ${res.summary!.faculty} faculty?` : `Publish ${res.summary!.changes} change${res.summary!.changes === 1 ? "" : "s"}${sendEmail ? ` and email ${res.summary!.affectedFaculty} faculty` : " without email"}?`}</span><span className="row"><button className="btn primary" disabled={!!busy} onClick={publish}>{busy ? "Publishing…" : "Yes, publish"}</button><button className="btn" onClick={() => setConfirming(false)}>Cancel</button></span></div>}
          </div>
        </div>
      )}
    </>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Upload", "Check", "Review", "Publish"];
  return <div className="stepper">{steps.map((s, i) => <div key={s} className={`step ${i + 1 < step ? "done" : i + 1 === step ? "active" : ""}`}><span className="num">{i + 1 < step ? "✓" : i + 1}</span>{s}</div>)}</div>;
}

function GridPreview({ data, changes }: { data: Dataset; changes: Change[] }) {
  const classes = [...new Set(data.slots.map((s) => `${s.semester}|${s.section}`))].sort();
  const [sel, setSel] = useState(classes[0] ?? "");
  const [sem, sec] = sel.split("|");
  return <div style={{ marginTop: 8 }}><select value={sel} onChange={(e) => setSel(e.target.value)} style={{ width: "auto", marginBottom: 8 }}>{classes.map((c) => <option key={c} value={c}>{c.replace("|", " ").trim()}</option>)}</select><TimetableGrid slots={data.slots.filter((s) => s.semester === sem && s.section === sec)} periods={data.periods} mode="class" changed={changedKeys(changes)} /></div>;
}

/** Repeated issues of one kind collapse into a single row with a count. */
function IssueList({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const m = new Map<string, { level: Issue["level"]; key: string; sample: Issue; items: Issue[] }>();
    for (const i of issues) {
      const key = i.level + "|" + i.message.replace(/\b[A-Z][A-Z0-9_]{1,}\b/g, "§").replace(/\d+/g, "#").replace(/"[^"]*"/g, '"…"');
      const g = m.get(key) ?? { level: i.level, key, sample: i, items: [] };
      g.items.push(i); m.set(key, g);
    }
    return [...m.values()].sort((a, b) => (a.level === b.level ? b.items.length - a.items.length : a.level === "error" ? -1 : 1));
  }, [issues]);
  const where = (i: Issue) => `${i.sheet}${i.row ? ` row ${i.row}` : ""}${i.column ? ` · ${i.column}` : ""}`;
  return (
    <div style={{ marginTop: 10 }}>
      {groups.map((g) => {
        if (g.items.length <= 3) return g.items.map((i, k) => <div className="issue" key={g.key + k}><span className={`pill ${i.level === "error" ? "bad" : "warn"}`}>{i.level}</span><span className="mono">{where(i)}</span><span>{i.message}</span></div>);
        const isOpen = open.has(g.key);
        return (
          <div key={g.key}>
            <div className="issue"><span className={`pill ${g.level === "error" ? "bad" : "warn"}`}>{g.level}</span><span className="mono">{g.items.length}× {g.sample.sheet}</span>
              <span>{g.sample.message} <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setOpen((o) => { const n = new Set(o); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>{isOpen ? "Hide" : `Show all ${g.items.length}`}</button></span></div>
            {isOpen && <div style={{ maxHeight: 260, overflowY: "auto", borderLeft: "3px solid var(--line)", marginLeft: 8, paddingLeft: 10 }}>{g.items.map((i, k) => <div className="issue" key={k} style={{ gridTemplateColumns: "0 150px 1fr" }}><span /><span className="mono">{where(i)}</span><span>{i.message}</span></div>)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Reminders
interface Plan { date: string; day: string; label: string; skip: string | null; counts: { willEmail: number; noClasses: number; optedOut: number; noEmail: number }; recipients: { id: string; name: string; email: string; classes: number; subject: string }[]; preview: { id: string; name: string; subject: string; html: string } | null }

function Reminders({ status, live, onDone }: { status: Status; live: VersionRow | null; onDone: () => void }) {
  const s = status.settings!;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [holiday, setHoliday] = useState("");
  const load = (pf?: string | null) => api<Plan>(`/api/admin/reminders${pf ? `?preview=${pf}` : ""}`).then(setPlan).catch((e) => setMsg(e.message));
  useEffect(() => { load(previewFor); }, [previewFor]);
  const saveSettings = async (patch: Partial<Settings>) => { setBusy(true); try { await api("/api/admin/reminders", { method: "POST", body: JSON.stringify({ action: "settings", ...patch }) }); onDone(); load(previewFor); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const sendNow = async () => { setBusy(true); setMsg(null); try { const r = await api<any>("/api/admin/reminders", { method: "POST", body: JSON.stringify({ action: "send" }) }); setMsg(r.skip ? `Not sent: ${r.skip}` : `Sent ${r.sent}, skipped ${r.skipped}, failed ${r.failed} of ${r.planned}.`); onDone(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <>
      <div className="card">
        <div className="row between">
          <div><h2>Daily reminders</h2><p className="muted small" style={{ margin: "4px 0 0" }}>Every teaching morning each faculty member gets one email listing that day's classes. Nobody is emailed on a day they have no classes. Faculty can switch theirs off from the portal.</p></div>
          <label className="toggle-row" style={{ border: 0, padding: 0 }}><span><b>{s.reminderEnabled ? "On" : "Paused"}</b></span><input type="checkbox" className="toggle" checked={s.reminderEnabled} disabled={busy} onChange={(e) => saveSettings({ reminderEnabled: e.target.checked })} /></label>
        </div>
        {!status.config?.cron && <div className="notice warn small" style={{ marginTop: 10 }}>The automatic morning run needs <code>CRON_SECRET</code> set in Vercel (see Setup). Until then use “Send now” below.</div>}
        {!status.config?.email && <div className="notice warn small" style={{ marginTop: 10 }}>Email is not configured, so reminders are planned and logged but not delivered.</div>}
      </div>

      <div className="card">
        <h3>Today — {plan?.label ?? "…"}</h3>
        {plan?.skip && <div className="notice info small">No reminders today: {plan.skip}</div>}
        {plan && !plan.skip && (
          <>
            <div className="grid stats">
              <div className="stat"><div className="n">{plan.counts.willEmail}</div><div className="l">will be emailed</div></div>
              <div className="stat"><div className="n">{plan.counts.noClasses}</div><div className="l">no classes today</div></div>
              <div className="stat"><div className="n">{plan.counts.noEmail}</div><div className="l">have classes, no email</div></div>
              <div className="stat"><div className="n">{plan.counts.optedOut}</div><div className="l">switched off</div></div>
            </div>
            <div className="row" style={{ margin: "12px 0" }}>
              <button className="btn primary" disabled={busy || plan.counts.willEmail === 0} onClick={sendNow} title={plan.counts.willEmail === 0 ? "Nobody with classes today has an email address on file" : ""}>{busy ? "Sending…" : `Send today's ${plan.counts.willEmail} reminder${plan.counts.willEmail === 1 ? "" : "s"} now`}</button>
              <select value={previewFor ?? plan.preview?.id ?? ""} onChange={(e) => setPreviewFor(e.target.value)} style={{ width: "auto" }}>{plan.recipients.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.classes} class{r.classes === 1 ? "" : "es"}</option>)}</select>
              {msg && <span className="small">{msg}</span>}
            </div>
            {plan.preview && <div className="email-preview"><div className="subject"><b>To:</b> {plan.recipients.find((r) => r.id === plan.preview!.id)?.email || "(no email)"} · <b>Subject:</b> {plan.preview.subject}</div><iframe title="Reminder preview" srcDoc={plan.preview.html} sandbox="" /></div>}
          </>
        )}
        {!plan && !msg && <p className="muted small">Working out today's recipients…</p>}
        {msg && !plan && <div className="notice bad small">{msg}</div>}
      </div>

      <div className="card">
        <h3>Schedule</h3>
        <div className="grid two">
          <div>
            <label className="field" htmlFor="reminder-hour">Send at (IST)</label>
            <select id="reminder-hour" value={s.reminderHour} disabled={busy} onChange={(e) => saveSettings({ reminderHour: Number(e.target.value) })} style={{ width: "auto" }}>{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
            <p className="muted small">The Vercel schedule in <code>vercel.json</code> fires at 07:00 IST; change both to move it.</p>
          </div>
          <div>
            <label className="field">Days</label>
            <div className="chips">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <label key={d}><input type="checkbox" checked={s.reminderDays.includes(d)} disabled={busy} onChange={(e) => saveSettings({ reminderDays: e.target.checked ? [...s.reminderDays, d] : s.reminderDays.filter((x) => x !== d) })} />{d}</label>)}</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="field" htmlFor="holiday-date">Holidays (no classes, no reminders)</label>
          <div className="row"><input id="holiday-date" type="date" value={holiday} onChange={(e) => setHoliday(e.target.value)} style={{ width: "auto" }} /><button className="btn sm" disabled={!holiday || busy} onClick={() => { saveSettings({ holidays: [...s.holidays, holiday] }); setHoliday(""); }}>Add holiday</button></div>
          <div className="chips" style={{ marginTop: 8 }}>{s.holidays.length === 0 && <span className="muted small">None added yet.</span>}{s.holidays.map((h) => <span key={h} className="pill light">{h} <button className="btn sm" style={{ padding: "0 6px", marginLeft: 4 }} onClick={() => saveSettings({ holidays: s.holidays.filter((x) => x !== h) })} title="Remove">×</button></span>)}</div>
        </div>
        {live && <p className="muted small" style={{ marginTop: 10 }}>Reminders run only between the semester dates in the Semesters sheet ({live.semesters.join(", ")}).</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Announce
function Announce({ live, anns, onDone }: { live: VersionRow | null; anns: Announcement[]; onDone: () => void }) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [email, setEmail] = useState(true);
  const [aud, setAud] = useState("all"); const [ids, setIds] = useState(""); const [expires, setExpires] = useState(""); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const audience = aud === "all" ? { kind: "all" } : aud === "ids" ? { kind: "faculty", ids: ids.split(/[\s,;]+/).filter(Boolean) } : { kind: "semester", semester: aud.slice(4) };
      const r = await api<any>("/api/admin/announce", { method: "POST", body: JSON.stringify({ title, body, email, audience, expiresAt: expires ? new Date(expires).toISOString() : undefined }) });
      setMsg(`Posted.${email ? ` Email: ${r.emails.sent} sent, ${r.emails.skipped} skipped, ${r.emails.failed} failed of ${r.emails.recipients}.` : ""}`); setTitle(""); setBody(""); onDone();
    } catch (x: any) { setMsg(x.message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="card">
        <h2>Post an announcement</h2>
        <p className="muted small">Shows in the portal's Alerts tab and on the Today screen for the chosen audience; optionally emailed. For holidays, exam notices, a one-day room swap — anything that does not need a new Excel.</p>
        <form className="stack" onSubmit={submit}>
          <div><label className="field" htmlFor="ann-title">Title</label><input id="ann-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></div>
          <div><label className="field" htmlFor="ann-body">Message</label><textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} required /></div>
          <div className="grid two">
            <div><label className="field" htmlFor="ann-aud">Audience</label>
              <select id="ann-aud" value={aud} onChange={(e) => setAud(e.target.value)}><option value="all">All faculty</option>{(live?.semesters ?? []).map((s) => <option key={s} value={`sem:${s}`}>{s} faculty only</option>)}<option value="ids">Specific people…</option></select>
              {aud === "ids" && <input type="text" placeholder="Faculty IDs, e.g. RPS, ABC, SKK" value={ids} onChange={(e) => setIds(e.target.value)} style={{ marginTop: 6 }} />}</div>
            <div><label className="field" htmlFor="ann-exp">Hide after (optional)</label><input id="ann-exp" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          </div>
          <label className="row small"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also email the audience</label>
          {msg && <div className="notice info small">{msg}</div>}
          <div><button className="btn primary" disabled={busy || !live}>{busy ? "Posting…" : "Post announcement"}</button>{!live && <span className="muted small" style={{ marginLeft: 8 }}>Publish a timetable first so the faculty list exists.</span>}</div>
        </form>
      </div>
      <div className="card"><h3>Previous announcements</h3>{anns.length === 0 ? <p className="muted small">None yet.</p> : <div className="table-wrap"><table><thead><tr><th>When</th><th>Title</th><th>Audience</th><th>Emailed</th></tr></thead><tbody>{anns.map((a) => <tr key={a.id}><td className="small">{fmtDate(a.createdAt)}</td><td><b>{a.title}</b><div className="small muted" style={{ whiteSpace: "pre-wrap" }}>{a.body}</div></td><td className="small">{a.audience.kind === "all" ? "All" : a.audience.kind === "semester" ? a.audience.semester : a.audience.ids.join(", ")}</td><td>{a.emailed ? "Yes" : "No"}</td></tr>)}</tbody></table></div>}</div>
    </>
  );
}

// ---------------------------------------------------------------- Versions
function Versions({ versions, onDone }: { versions: VersionRow[]; onDone: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const rollback = async (v: VersionRow) => {
    setBusy(v.id);
    try { await api("/api/admin/rollback", { method: "POST", body: JSON.stringify({ versionId: v.id }) }); onDone(); } catch (e: any) { alert(e.message); } finally { setBusy(null); setConfirmId(null); }
  };
  return (
    <div className="card">
      <h2>Versions</h2>
      <p className="muted small">Every upload is kept. Rolling back republishes an older version as a new one, so the portal, alerts and emails stay consistent.</p>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Status</th><th>File</th><th>Uploaded</th><th>Published</th><th>Slots</th><th>Changes</th><th>Note</th><th></th></tr></thead>
        <tbody>{versions.map((v) => <tr key={v.id}><td><b>{v.id}</b></td><td><span className={`pill ${v.status === "published" ? "good" : v.status === "draft" ? "warn" : "light"}`}>{v.status}</span></td><td className="small">{v.fileName}</td><td className="small">{fmtDate(v.createdAt)}</td><td className="small">{v.publishedAt ? fmtDate(v.publishedAt) : "—"}</td><td>{v.summary.slots}</td><td>{v.summary.changes}</td><td className="small">{v.note}</td>
          <td>{v.status === "superseded" && (confirmId === v.id ? <span className="row"><button className="btn sm danger" disabled={busy === v.id} onClick={() => rollback(v)}>Confirm</button><button className="btn sm" onClick={() => setConfirmId(null)}>Cancel</button></span> : <button className="btn sm" onClick={() => setConfirmId(v.id)}>Roll back to this</button>)}</td></tr>)}</tbody></table></div>
    </div>
  );
}

// ---------------------------------------------------------------- Reach
function Reach({ versions, acks, onDone }: { versions: VersionRow[]; acks: Ack[]; onDone: () => void }) {
  const pubs = versions.filter((v) => v.status !== "draft");
  const [sel, setSel] = useState(pubs[0]?.id ?? 0);
  const v = pubs.find((x) => x.id === sel);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  if (!v) return <div className="card muted">Nothing published yet.</div>;
  const affected = v.changes.length === 0 ? v.faculty : v.faculty.filter((f) => v.changes.some((c) => c.affectedFacultyIds.includes(f.id)));
  const seen = new Set(acks.filter((a) => a.versionId === v.id).map((a) => a.facultyId));
  const unseen = affected.filter((f) => !seen.has(f.id));
  const resend = async () => { setBusy(true); setMsg(null); try { const r = await api<any>("/api/admin/resend", { method: "POST", body: JSON.stringify({ versionId: v.id }) }); setMsg(`Reminder: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed of ${r.recipients}.`); onDone(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="row between"><h2>Who has seen version {v.id}</h2><select value={sel} onChange={(e) => setSel(Number(e.target.value))} style={{ width: "auto" }}>{pubs.map((p) => <option key={p.id} value={p.id}>Version {p.id} · {fmtDate(p.publishedAt)}</option>)}</select></div>
      <div className="grid stats" style={{ margin: "10px 0" }}><div className="stat"><div className="n">{affected.length}</div><div className="l">faculty affected</div></div><div className="stat"><div className="n">{affected.length - unseen.length}</div><div className="l">marked as seen</div></div><div className="stat"><div className="n">{unseen.length}</div><div className="l">not yet seen</div></div></div>
      <div className="row"><button className="btn primary" disabled={busy || unseen.length === 0} onClick={resend}>{busy ? "Sending…" : `Re-email the ${unseen.length} who have not seen it`}</button>{msg && <span className="small">{msg}</span>}</div>
      <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Seen at</th></tr></thead>
        <tbody>{affected.sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || a.name.localeCompare(b.name)).map((f) => { const a = acks.find((x) => x.versionId === v.id && x.facultyId === f.id); return <tr key={f.id}><td><b>{f.name}</b></td><td className="small">{f.email || <span className="muted">—</span>}</td><td>{a ? <span className="pill good">Seen</span> : <span className="pill warn">Not seen</span>}</td><td className="small">{a ? fmtDate(a.seenAt) : "—"}</td></tr>; })}</tbody></table></div>
    </div>
  );
}

// ---------------------------------------------------------------- People
function People({ live, acks, prefs }: { live: VersionRow | null; acks: Ack[]; prefs: Prefs[] }) {
  const [q, setQ] = useState("");
  if (!live) return <div className="card muted">Publish a timetable first; the faculty list comes from its Faculty sheet.</div>;
  const everSeen = new Set(acks.map((a) => a.facultyId));
  const pref = new Map(prefs.map((p) => [p.facultyId, p]));
  const list = live.faculty.filter((f) => `${f.name} ${f.id} ${f.email} ${f.department ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const noEmail = live.faculty.filter((f) => !f.email).length;
  return (
    <div className="card">
      <div className="row between"><h2>People ({live.faculty.length})</h2><input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} /></div>
      <p className="muted small">This is the <b>Faculty</b> sheet of the live version. To add names or emails: <a href="/api/admin/template?which=current">download the current Excel</a>, fill the <b>Full name</b> and <b>Email</b> columns, and upload it again. Names and emails you have filled in are kept automatically when you upload a fresh grid-format master.</p>
      {noEmail > 0 && <div className="notice warn small" style={{ margin: "8px 0" }}><b>{noEmail} faculty have no email address</b> and cannot receive alerts or reminders.</div>}
      <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Email</th><th>Morning reminder</th><th>Change alerts</th><th>Used portal</th></tr></thead>
        <tbody>{list.map((f) => { const p = pref.get(f.id); return <tr key={f.id}><td className="mono small">{f.id}</td><td><b>{f.name}</b>{f.onLeave ? <span className="pill warn" style={{ marginLeft: 6 }}>on leave</span> : null}</td><td className="small">{f.department}</td><td className="small">{f.email || <span className="pill warn">missing</span>}</td><td>{p?.dailyReminder === false ? <span className="pill light">off</span> : <span className="pill good">on</span>}</td><td>{p?.changeEmails === false ? <span className="pill light">off</span> : <span className="pill good">on</span>}</td><td>{everSeen.has(f.id) ? <span className="pill good">Yes</span> : <span className="pill light">Not yet</span>}</td></tr>; })}</tbody></table></div>
    </div>
  );
}

// ---------------------------------------------------------------- Email log
function EmailLog({ log }: { log: EmailLogEntry[] }) {
  const [kind, setKind] = useState<string>("all");
  const shown = log.filter((e) => kind === "all" || e.kind === kind);
  return (
    <div className="card">
      <div className="row between"><h2>Email log</h2><select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: "auto" }}><option value="all">All kinds</option><option value="publish">Publish alerts</option><option value="daily">Morning reminders</option><option value="announcement">Announcements</option><option value="reminder">Re-sends</option></select></div>
      <p className="muted small">Latest {shown.length} messages. “Skipped” means email is not configured or the person has no address; “failed” shows the provider's reason.</p>
      <div className="table-wrap"><table><thead><tr><th>When</th><th>Kind</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
        <tbody>{shown.map((e) => <tr key={e.id}><td className="small">{fmtDate(e.createdAt)}</td><td className="small">{e.kind}</td><td className="small">{e.recipient}</td><td className="small">{e.subject}</td><td><span className={`pill ${e.status === "sent" ? "good" : e.status === "failed" ? "bad" : "warn"}`} title={e.error}>{e.status}</span>{e.error && <div className="small muted">{e.error}</div>}</td></tr>)}</tbody></table></div>
    </div>
  );
}

// ---------------------------------------------------------------- Setup
function Setup({ status }: { status: Status }) {
  const c = status.config!;
  const [to, setTo] = useState("gaurav.negi@juitsolan.in"); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const test = async () => { setBusy(true); setMsg(null); try { const r = await api<any>("/api/admin/test-email", { method: "POST", body: JSON.stringify({ to }) }); setMsg(r.ok ? `Sent via ${r.transport}. Check the inbox (and spam) of ${to}.` : `Not sent: ${r.error}`); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  return (
    <div className="card">
      <h2>Setup</h2>
      <div className="notice info" style={{ marginBottom: 12 }}>
        <b>Test email.</b> <span className="small">Sends one message using the current settings.</span>
        <div className="row" style={{ marginTop: 6 }}><input type="text" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 280 }} placeholder="address" /><button className="btn sm primary" disabled={busy || !c.email} onClick={test}>{busy ? "Sending…" : "Send test"}</button>{!c.email && <span className="muted small">Configure SMTP_USER and SMTP_PASS first.</span>}{msg && <span className="small">{msg}</span>}</div>
      </div>
      <p className="muted small">These are set once in Vercel → Project → Settings → Environment Variables, then redeploy. The website reads them on start.</p>
      <dl className="kv">
        <dt>Portal URL</dt><dd>{c.site.url}</dd>
        <dt>Department</dt><dd>{c.site.department}</dd>
        <dt>Database</dt><dd>{c.store}</dd>
        <dt>Email</dt><dd>{c.email ? `${c.transport === "smtp" ? "Office mailbox (SMTP)" : "Resend"} · from ${c.from}` : `off · will send as ${c.from}`}</dd>
        <dt>Morning run</dt><dd>{c.cron ? "CRON_SECRET set · Vercel Cron at 07:00 IST" : "CRON_SECRET not set"}</dd>
      </dl>
      <div className="table-wrap" style={{ marginTop: 14 }}><table><thead><tr><th>Variable</th><th>What it does</th></tr></thead><tbody>
        <tr><td className="mono">ADMIN_PASSWORD</td><td>The one TTC admin password. Sessions last 12 hours.</td></tr>
        <tr><td className="mono">ADMIN_SECRET</td><td>Any long random string; signs the sign-in cookie.</td></tr>
        <tr><td className="mono">CRON_SECRET</td><td>Any long random string; lets Vercel's scheduler call the 07:00 reminder run. Vercel sets the matching header automatically.</td></tr>
        <tr><td className="mono">SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY</td><td>Database. Run <code>supabase/schema.sql</code> once in the Supabase SQL editor.</td></tr>
        <tr><td className="mono">SMTP_USER / SMTP_PASS</td><td>Send from the office mailbox <b>timetable2026@juitsolan.in</b>. For Google Workspace: turn on 2-step verification, create an App Password at myaccount.google.com/apppasswords, paste it as SMTP_PASS. SMTP_HOST defaults to smtp.gmail.com, port 465. No DNS changes needed.</td></tr>
        <tr><td className="mono">RESEND_API_KEY</td><td>Alternative sender: Resend, after verifying the domain there (SPF/DKIM from IT).</td></tr>
        <tr><td className="mono">EMAIL_FROM / EMAIL_REPLY_TO</td><td>Optional. Default: "JUIT Time Table Committee &lt;timetable2026@juitsolan.in&gt;".</td></tr>
        <tr><td className="mono">NEXT_PUBLIC_SITE_URL</td><td>Used in every email link and the calendar feed, e.g. https://timetable.juitsolan.ac.in</td></tr>
        <tr><td className="mono">NEXT_PUBLIC_DEPARTMENT_NAME / NEXT_PUBLIC_INSTITUTE_NAME</td><td>Shown in the header and emails.</td></tr>
      </tbody></table></div>
    </div>
  );
}
