"use client";
import { useEffect, useMemo, useState } from "react";
import { DAYS, type Announcement, type Change, type Faculty, type Prefs, type PublicPayload, type Slot } from "@/lib/types";
import { DownloadButton, FacultyPicker, SlotModal, TimetableGrid, batchLabel, changedKeys, facultyName, fmtDate, nowHHMM, slotLabel, subjectTitle, todayDay, weekOfSemester } from "./shared";

type Tab = "today" | "week" | "classes" | "rooms" | "alerts" | "people";
const FID_KEY = "tt_fid";
const TABS: [Tab, string][] = [["today", "Today"], ["week", "My week"], ["classes", "Classes"], ["rooms", "Rooms"], ["alerts", "Alerts"], ["people", "Faculty"]];

export function Portal() {
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fid, setFid] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [picking, setPicking] = useState(false);
  const [modal, setModal] = useState<Slot | null>(null);
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [jump, setJump] = useState<{ kind: "class" | "room" | "faculty"; id: string } | null>(null);

  const load = () => fetch("/api/timetable", { cache: "no-store" }).then((r) => r.json()).then(setPayload).catch((e) => setError(String(e)));
  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get("f");
    try {
      if (fromLink) { localStorage.setItem(FID_KEY, fromLink.toUpperCase()); setFid(fromLink.toUpperCase()); }
      else setFid(localStorage.getItem(FID_KEY));
    } catch { if (fromLink) setFid(fromLink.toUpperCase()); }
    if (params.get("alerts")) setTab("alerts");
    if (params.get("reminders")) setTab("today");
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    const refresh = setInterval(load, 5 * 60000);
    return () => { clearInterval(t); clearInterval(refresh); };
  }, []);

  const data = payload?.data ?? null;
  const me: Faculty | null = useMemo(() => (data && fid ? data.faculty.find((f) => f.id === fid) ?? null : null), [data, fid]);
  useEffect(() => { if (data && !me) setPicking(true); }, [data, me]);

  const mySlots = useMemo(() => (data && me ? data.slots.filter((s) => s.facultyIds.includes(me.id)) : []), [data, me]);
  const seenVersions = useMemo(() => new Set((payload?.acks ?? []).filter((a) => a.facultyId === me?.id).map((a) => a.versionId)), [payload, me]);
  const unseen = useMemo(() => {
    if (!payload || !me) return 0;
    return payload.recentPublishes.filter((p) => !seenVersions.has(p.id) && (p.changes.length === 0 || p.changes.some((c) => c.affectedFacultyIds.includes(me.id)))).length;
  }, [payload, me, seenVersions]);
  const myPrefs: Prefs | undefined = useMemo(() => payload?.prefs.find((p) => p.facultyId === me?.id), [payload, me]);

  const pick = (f: Faculty) => { try { localStorage.setItem(FID_KEY, f.id); } catch {} setFid(f.id); setPicking(false); };
  const go = (kind: "class" | "room" | "faculty", id: string) => { setJump({ kind, id }); setTab(kind === "class" ? "classes" : kind === "room" ? "rooms" : "people"); setSearch(""); };

  if (error) return <Shell site={payload?.site}><div className="container"><div className="notice bad">Could not load the timetable: {error}</div></div></Shell>;
  if (!payload) return <Shell><div className="container"><div className="card muted">Loading timetable…</div></div></Shell>;
  if (!data || !payload.version) return (
    <Shell site={payload.site}>
      <div className="container"><div className="card empty">
        <div className="empty-art">📅</div>
        <h2>No timetable published yet</h2>
        <p className="muted">When the department office publishes the semester timetable, this page fills in on its own and every faculty member can open it from this same link.</p>
        <a className="btn" href="/admin">Office sign-in</a>
      </div></div>
    </Shell>
  );

  const weekInfo = weekOfSemester(data, mySlots[0]?.semester);
  const results = search.trim().length >= 2 ? searchAll(data, search.trim()) : null;

  return (
    <Shell site={payload.site} right={
      <>
        {weekInfo && <span className="pill">{weekInfo}</span>}
        <button className="btn sm who" onClick={() => setPicking(true)} title="Switch person">{me ? <><span className="avatar">{initials(me.name)}</span>{me.name}</> : "Choose your name"}</button>
      </>
    }>
      <div className="container">
        <div className="toolbar no-print">
          <div className="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => { setTab(k); setJump(null); }}>{label}{k === "alerts" && unseen > 0 && <span className="badge">{unseen}</span>}</button>
            ))}
          </div>
          <div className="search-wrap">
            <input id="global-search" type="search" placeholder="Find a course, room or person…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {results && (
              <div className="search-results">
                {results.length === 0 && <div className="muted small" style={{ padding: 10 }}>Nothing matches “{search}”.</div>}
                {results.map((r) => <button key={r.kind + r.id} onClick={() => go(r.kind, r.id)}><span className={`pill light`}>{r.kind}</span> {r.label}<small>{r.sub}</small></button>)}
              </div>
            )}
          </div>
        </div>

        {tab === "today" && me && <Today me={me} slots={mySlots} payload={payload} prefs={myPrefs} unseen={unseen} goAlerts={() => setTab("alerts")} onCell={setModal} tick={tick} onPrefs={load} />}
        {tab === "today" && !me && <div className="card empty"><div className="empty-art">👋</div><h2>Welcome</h2><p className="muted">Choose your name once and this device will remember you. No password needed.</p><button className="btn primary" onClick={() => setPicking(true)}>Choose my name</button></div>}
        {tab === "week" && me && <MyWeek me={me} slots={mySlots} payload={payload} onCell={setModal} />}
        {tab === "week" && !me && <div className="card"><p>Pick your name to see your week.</p><button className="btn primary" onClick={() => setPicking(true)}>Choose my name</button></div>}
        {tab === "classes" && <Classes payload={payload} onCell={setModal} initial={jump?.kind === "class" ? jump.id : undefined} />}
        {tab === "rooms" && <Rooms payload={payload} onCell={setModal} initial={jump?.kind === "room" ? jump.id : undefined} />}
        {tab === "alerts" && <Alerts payload={payload} me={me} seen={seenVersions} onAck={async (vid) => { if (!me) return; await fetch("/api/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId: vid, facultyId: me.id }) }); load(); }} />}
        {tab === "people" && <People payload={payload} me={me} onCell={setModal} initial={jump?.kind === "faculty" ? jump.id : undefined} />}

        <div className="footer">
          Version {payload.version.id} · published {fmtDate(payload.version.publishedAt)} · {payload.site.institute}
          <br />Only the department office can publish changes. If something looks wrong, reply to the timetable email.
        </div>
      </div>
      {picking && <FacultyPicker faculty={data.faculty} onPick={pick} onClose={me ? () => setPicking(false) : undefined} />}
      {modal && <SlotModal slot={modal} data={data} onClose={() => setModal(null)} />}
    </Shell>
  );
}

function initials(name: string) { return name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }

function searchAll(data: NonNullable<PublicPayload["data"]>, q: string) {
  const l = q.toLowerCase();
  const out: { kind: "class" | "room" | "faculty"; id: string; label: string; sub: string }[] = [];
  for (const f of data.faculty) if (`${f.name} ${f.id} ${f.department ?? ""}`.toLowerCase().includes(l)) out.push({ kind: "faculty", id: f.id, label: f.name, sub: [f.id !== f.name ? f.id : "", f.department, f.designation].filter(Boolean).join(" · ") });
  const rooms = new Set<string>(), codes = new Map<string, Slot>();
  for (const s of data.slots) {
    if (s.room.toLowerCase().includes(l)) rooms.add(s.room);
    if (s.subjectCode.toLowerCase().includes(l) || s.subjectName.toLowerCase().includes(l)) codes.set(`${s.semester}|${s.section}|${s.subjectCode}`, s);
  }
  for (const r of [...rooms].sort()) out.push({ kind: "room", id: r, label: r, sub: `${data.slots.filter((s) => s.room === r).length} periods/week` });
  for (const s of codes.values()) out.push({ kind: "class", id: `${s.semester}|${s.section}`, label: `${s.subjectCode}${subjectTitle(s.subjectCode, s.subjectName) ? " " + s.subjectName : ""}`, sub: `${s.semester}${s.section ? " " + s.section : ""} · ${s.facultyIds.map((id) => facultyName(data, id)).join(", ")}` });
  return out.slice(0, 12);
}

function Shell({ children, site, right }: { children: React.ReactNode; site?: PublicPayload["site"]; right?: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">TT</div>
            <div><h1>Department Timetable</h1><div className="sub">{site?.department ?? "JUIT Solan"}</div></div>
          </div>
          <div className="topbar-actions">{right}</div>
        </div>
      </header>
      {children}
    </>
  );
}

function minutesUntil(hhmm: string, now: string) {
  const [h1, m1] = hhmm.split(":").map(Number), [h2, m2] = now.split(":").map(Number);
  return h1 * 60 + m1 - (h2 * 60 + m2);
}

function Today({ me, slots, payload, prefs, unseen, goAlerts, onCell, tick, onPrefs }: { me: Faculty; slots: Slot[]; payload: PublicPayload; prefs?: Prefs; unseen: number; goAlerts: () => void; onCell: (s: Slot) => void; tick: number; onPrefs: () => void }) {
  void tick;
  const day = todayDay();
  const now = nowHHMM();
  const todays = day ? slots.filter((s) => s.day === day).sort((a, b) => a.period - b.period) : [];
  const current = todays.find((s) => (s.start ?? "") <= now && (s.end ?? "99") > now);
  const next = todays.find((s) => (s.start ?? "99") > now);
  const site = payload.site;
  const ics = `${site.url.replace(/\/$/, "")}/api/ics/${me.id}`;
  const activeAnns = payload.announcements.filter((a) => audienceIncludes(a, me, payload)).slice(0, 3);
  const remaining = todays.filter((s) => (s.end ?? "99") > now).length;

  return (
    <div className="grid two">
      <div className="stack">
        {unseen > 0 && <div className="notice warn row between"><span><b>{unseen} timetable update{unseen > 1 ? "s" : ""}</b> you haven't seen yet.</span><button className="btn sm" onClick={goAlerts}>View alerts</button></div>}
        {activeAnns.map((a) => <div key={a.id} className="notice info"><b>{a.title}</b><div className="small" style={{ whiteSpace: "pre-wrap" }}>{a.body}</div></div>)}

        {day && todays.length > 0 && (
          <div className="now-strip">
            {current ? (
              <div className="now-item"><span className="now-label">Now</span><b>{current.subjectCode}</b> in <b>{current.room}</b> · ends {current.end}</div>
            ) : next ? (
              <div className="now-item"><span className="now-label">Next</span><b>{next.subjectCode}</b> in <b>{next.room}</b> at {next.start} · in {minutesUntil(next.start!, now)} min</div>
            ) : (
              <div className="now-item"><span className="now-label done">Done</span>All {todays.length} classes finished for today.</div>
            )}
            {next && current && <div className="now-item quiet">Then {next.subjectCode} at {next.start} in {next.room}</div>}
          </div>
        )}

        <div className="card">
          <div className="row between">
            <h2>{day ? `Today, ${day}` : "Sunday"}</h2>
            <div className="row">
              {day && remaining > 0 && remaining < todays.length && <span className="pill light">{remaining} left</span>}
              <DownloadButton kind="faculty" id={me.id} label="Download my week" />
            </div>
          </div>
          {!day && <p className="muted">No classes on Sunday. Your week is in the next tab.</p>}
          {day && todays.length === 0 && <p className="muted">No classes today. Enjoy the free day.</p>}
          <div className="stack" style={{ marginTop: 10 }}>
            {todays.map((s) => (
              <div key={s.key} className={`today-item ${s === current ? "live" : s === next ? "next" : (s.end ?? "99") <= now ? "past" : ""}`} onClick={() => onCell(s)} style={{ cursor: "pointer" }}>
                <div className="time">{s.start}<small>P{s.period} · to {s.end}</small></div>
                <div className="what"><b>{s.subjectCode}{subjectTitle(s.subjectCode, s.subjectName) ? ` ${s.subjectName}` : ""}</b><span>{slotLabel(s)} · {s.type}{s.facultyIds.length > 1 ? ` · with ${s.facultyIds.filter((id) => id !== me.id).map((id) => facultyName(payload.data!, id)).join(", ")}` : ""}{s.notes ? ` · ${s.notes}` : ""}</span></div>
                <div className="room-chip">{s.room}</div>
              </div>
            ))}
          </div>
        </div>

        <ReminderCard me={me} prefs={prefs} payload={payload} onSaved={onPrefs} />
      </div>

      <div className="stack">
        <div className="card">
          <h3>This semester</h3>
          <div className="grid stats">
            <div className="stat"><div className="n">{slots.length}</div><div className="l">periods / week</div></div>
            <div className="stat"><div className="n">{slots.filter((s) => s.type === "Lecture").length}</div><div className="l">lectures</div></div>
            <div className="stat"><div className="n">{slots.filter((s) => s.type === "Lab").length}</div><div className="l">labs</div></div>
            <div className="stat"><div className="n">{slots.filter((s) => s.type === "Tutorial").length}</div><div className="l">tutorials</div></div>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table><thead><tr><th>Course</th><th>Group</th><th>Type</th><th>Per week</th></tr></thead>
              <tbody>{groupSubjects(slots).map((g) => <tr key={g.k}><td><b>{g.code}</b> {subjectTitle(g.code, g.name)}</td><td>{g.cls}</td><td>{g.type}</td><td>{g.n}</td></tr>)}</tbody></table>
          </div>
        </div>
        <div className="card">
          <h3>Keep it with you</h3>
          <div className="stack small">
            <div className="row between"><span>Calendar subscription (Google / Outlook / iPhone). Updates itself when the timetable changes.</span><CopyButton text={ics} label="Copy link" /></div>
            <code className="small" style={{ wordBreak: "break-all" }}>{ics}</code>
            <div className="row between"><span>Your personal link to this page</span><CopyButton text={`${site.url.replace(/\/$/, "")}/?f=${me.id}`} label="Copy" /></div>
            <div className="row" data-print-action><button className="btn sm" onClick={() => window.print()}>Print my week</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReminderCard({ me, prefs, payload, onSaved }: { me: Faculty; prefs?: Prefs; payload: PublicPayload; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const daily = prefs?.dailyReminder ?? true;
  const changes = prefs?.changeEmails ?? true;
  const s = payload.settings;
  const hour = `${String(s.reminderHour).padStart(2, "0")}:00`;
  const save = async (patch: Partial<Prefs>) => {
    setBusy(true);
    try { await fetch("/api/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facultyId: me.id, ...patch }) }); onSaved(); } finally { setBusy(false); }
  };
  return (
    <div className="card" id="reminders">
      <h3>Email reminders</h3>
      {!me.email && <div className="notice warn small" style={{ marginBottom: 8 }}>No email address is on file for you. Ask the timetable office to add it; your settings below take effect once it is.</div>}
      {me.email && <p className="muted small" style={{ margin: "0 0 8px" }}>Sent to <b>{me.email}</b>.</p>}
      <label className="toggle-row">
        <span><b>Morning reminder</b><small>Your classes for the day, at {hour} on teaching days. Nothing is sent on days you have no classes.</small></span>
        <input type="checkbox" className="toggle" checked={daily} disabled={busy || !s.reminderEnabled} onChange={(e) => save({ dailyReminder: e.target.checked })} />
      </label>
      <label className="toggle-row">
        <span><b>Change alerts</b><small>An email whenever one of your classes is moved, reassigned or changes room.</small></span>
        <input type="checkbox" className="toggle" checked={changes} disabled={busy} onChange={(e) => save({ changeEmails: e.target.checked })} />
      </label>
      {!s.reminderEnabled && <p className="muted small">The office has paused morning reminders for everyone.</p>}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => window.prompt("Copy this link:", text)); }}>{done ? "Copied" : label}</button>;
}

function groupSubjects(slots: Slot[]) {
  const m = new Map<string, { k: string; code: string; name: string; cls: string; type: string; n: number }>();
  for (const s of slots) { const k = `${s.subjectCode}|${s.semester}|${s.section}|${s.type}|${s.batch ?? ""}`; const g = m.get(k) ?? { k, code: s.subjectCode, name: s.subjectName, cls: `${s.semester}${s.section ? " " + s.section : ""}${s.batch ? " · " + batchLabel(s.batch) : ""}`, type: s.type, n: 0 }; g.n++; m.set(k, g); }
  return [...m.values()].sort((a, b) => a.cls.localeCompare(b.cls) || a.code.localeCompare(b.code));
}

function audienceIncludes(a: Announcement, me: Faculty | null, payload: PublicPayload) {
  if (a.audience.kind === "all") return true;
  if (!me) return false;
  if (a.audience.kind === "faculty") return a.audience.ids.includes(me.id);
  const sem = a.audience.semester;
  return payload.data?.slots.some((s) => s.semester === sem && s.facultyIds.includes(me.id)) ?? false;
}

function MyWeek({ me, slots, payload, onCell }: { me: Faculty; slots: Slot[]; payload: PublicPayload; onCell: (s: Slot) => void }) {
  const changed = changedKeys(payload.changes.filter((c) => c.affectedFacultyIds.includes(me.id)));
  return (
    <div className="card">
      <div className="row between">
        <h2>{me.name} — weekly timetable</h2>
        <div className="row"><span className="muted small">{slots.length} periods{changed.size > 0 ? ` · ${changed.size} changed in the latest publish (outlined)` : ""}</span><DownloadButton kind="faculty" id={me.id} label="Download as Excel" /></div>
      </div>
      <TimetableGrid slots={slots} periods={payload.data!.periods} mode="faculty" changed={changed} onCell={onCell} />
      <p className="muted small" style={{ marginTop: 8 }}>Tap a class for room, co-faculty and notes. Blue = lecture, green = lab, amber = tutorial. The download has the same grid plus the office's one-row “Faculty view” format.</p>
    </div>
  );
}

function Classes({ payload, onCell, initial }: { payload: PublicPayload; onCell: (s: Slot) => void; initial?: string }) {
  const data = payload.data!;
  const classes = useMemo(() => [...new Set(data.slots.map((s) => `${s.semester}|${s.section}`))].sort(), [data]);
  const [sel, setSel] = useState(initial ?? classes[0] ?? "");
  useEffect(() => { if (initial) setSel(initial); }, [initial]);
  const [semester, section] = sel.split("|");
  const slots = data.slots.filter((s) => s.semester === semester && s.section === section);
  const changed = changedKeys(payload.changes);
  const sem = data.semesters.find((s) => s.name === semester);
  const title = `${semester}${section ? " — Section " + section : ""}`;
  return (
    <div className="card">
      <div className="row between">
        <h2>Class timetable</h2>
        <div className="row">
          <select id="class-select" value={sel} onChange={(e) => setSel(e.target.value)} style={{ width: "auto" }}>{classes.map((c) => { const [a, b] = c.split("|"); return <option key={c} value={c}>{a}{b ? ` — Section ${b}` : ""}</option>; })}</select>
          <DownloadButton kind="class" id={sel} label="Download" />
          <button className="btn sm" data-print-action onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {sem && <p className="muted small">{title} · {sem.startDate} to {sem.endDate}{sem.examWindow ? ` · Exams ${sem.examWindow}` : ""} · {slots.length} periods/week</p>}
      <TimetableGrid slots={slots} periods={data.periods} mode="class" changed={changed} onCell={onCell} />
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table><thead><tr><th>Code</th><th>Course</th><th>Type</th><th>Faculty</th><th>Per week</th></tr></thead>
          <tbody>{groupByCode(slots).map((g) => <tr key={g.k}><td><b>{g.code}</b></td><td>{subjectTitle(g.code, g.name)}</td><td>{g.type}</td><td>{g.fac.map((id) => facultyName(data, id)).join(", ")}</td><td>{g.n}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
function groupByCode(slots: Slot[]) {
  const m = new Map<string, { k: string; code: string; name: string; type: string; fac: string[]; n: number }>();
  for (const s of slots) { const k = `${s.subjectCode}|${s.type}`; const g = m.get(k) ?? { k, code: s.subjectCode, name: s.subjectName, type: s.type, fac: [], n: 0 }; g.n++; for (const f of s.facultyIds) if (!g.fac.includes(f)) g.fac.push(f); m.set(k, g); }
  return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function Rooms({ payload, onCell, initial }: { payload: PublicPayload; onCell: (s: Slot) => void; initial?: string }) {
  const data = payload.data!;
  const rooms = useMemo(() => [...new Set(data.slots.map((s) => s.room))].sort(), [data]);
  const [room, setRoom] = useState(initial ?? rooms[0] ?? "");
  useEffect(() => { if (initial) setRoom(initial); }, [initial]);
  const slots = data.slots.filter((s) => s.room === room);
  const total = data.periods.filter((p) => !p.isBreak).length * DAYS.length;
  const busy = new Set(slots.map((s) => `${s.day}|${s.period}`)).size;
  return (
    <div className="card">
      <div className="row between">
        <h2>Room timetable</h2>
        <div className="row">
          <select id="room-select" value={room} onChange={(e) => setRoom(e.target.value)} style={{ width: "auto" }}>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
          <span className="pill light">{busy} of {total} periods used</span>
          <DownloadButton kind="room" id={room} label="Download" />
        </div>
      </div>
      <TimetableGrid slots={slots} periods={data.periods} mode="room" changed={changedKeys(payload.changes)} onCell={onCell} />
      <p className="muted small" style={{ marginTop: 8 }}>Empty cells are free periods for this room — useful for extra classes and make-up sessions.</p>
    </div>
  );
}

function Alerts({ payload, me, seen, onAck }: { payload: PublicPayload; me: Faculty | null; seen: Set<number>; onAck: (versionId: number) => void }) {
  const [filter, setFilter] = useState<"mine" | "all">(me ? "mine" : "all");
  const anns = payload.announcements.filter((a) => filter === "all" || audienceIncludes(a, me, payload));
  const pubs = payload.recentPublishes.map((p) => ({ ...p, shown: filter === "mine" && me ? p.changes.filter((c) => c.affectedFacultyIds.includes(me.id)) : p.changes })).filter((p) => p.changes.length === 0 || p.shown.length > 0 || filter === "all");
  return (
    <div className="stack">
      <div className="row between">
        <h2>Alerts</h2>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={`tab ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")} disabled={!me}>Mine</button>
          <button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Department-wide</button>
        </div>
      </div>
      {anns.map((a) => (
        <div key={"a" + a.id} className="alert-group">
          <div className="alert-head"><b>Announcement · {a.title}</b><span className="muted small">{fmtDate(a.createdAt)}</span></div>
          <div className="alert-item" style={{ whiteSpace: "pre-wrap" }}>{a.body}</div>
        </div>
      ))}
      {pubs.map((p) => {
        const mineAffected = me && (p.changes.length === 0 || p.changes.some((c) => c.affectedFacultyIds.includes(me.id)));
        return (
          <div key={p.id} className="alert-group">
            <div className="alert-head">
              <div><b>Timetable version {p.id}</b> <span className="muted small">· {fmtDate(p.publishedAt)} · {p.changes.length === 0 ? "first publish of the semester" : `${p.changes.length} change${p.changes.length > 1 ? "s" : ""}${filter === "mine" ? `, ${p.shown.length} affecting you` : ""}`}</span></div>
              {me && mineAffected && (seen.has(p.id) ? <span className="pill good">Seen</span> : <button className="btn sm primary" onClick={() => onAck(p.id)}>Mark as seen</button>)}
            </div>
            {p.note && <div className="alert-note"><b>Office note:</b> {p.note}</div>}
            {p.shown.slice(0, 60).map((c) => <ChangeRow key={c.id} c={c} mine={!!me && c.affectedFacultyIds.includes(me.id)} />)}
            {p.shown.length > 60 && <div className="alert-item muted small">…and {p.shown.length - 60} more.</div>}
          </div>
        );
      })}
      {anns.length === 0 && pubs.length === 0 && <div className="card empty"><div className="empty-art">✓</div><p className="muted">Nothing here yet. Changes to your classes and office announcements will appear here.</p></div>}
    </div>
  );
}

const CHANGE_LABEL: Record<Change["type"], string> = { added: "New", removed: "Removed", moved: "Moved", reassigned: "Reassigned", room_changed: "Room", details_changed: "Details", grid_changed: "Timing" };
export function ChangeRow({ c, mine }: { c: Change; mine?: boolean }) {
  return <div className={`alert-item ${mine ? "mine" : ""}`}><span className={`chg ${c.type}`}>{CHANGE_LABEL[c.type]}</span><span>{c.text}</span></div>;
}

function People({ payload, me, onCell, initial }: { payload: PublicPayload; me: Faculty | null; onCell: (s: Slot) => void; initial?: string }) {
  const data = payload.data!;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>(me ? [me.id] : []);
  const [view, setView] = useState<string | null>(initial ?? null);
  useEffect(() => { if (initial) setView(initial); }, [initial]);
  const list = data.faculty.filter((f) => `${f.name} ${f.designation ?? ""} ${f.id} ${f.department ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const load = (id: string) => data.slots.filter((s) => s.facultyIds.includes(id)).length;
  const busy = new Set(data.slots.filter((s) => s.facultyIds.some((id) => sel.includes(id))).map((s) => `${s.day}|${s.period}`));
  const free = DAYS.map((d) => ({ d, periods: data.periods.filter((p) => !p.isBreak && !busy.has(`${d}|${p.number}`)).map((p) => p.number) }));
  const viewing = view ? data.faculty.find((f) => f.id === view) : null;
  return (
    <div className="grid two">
      <div className="card">
        <div className="row between"><h2>Faculty directory</h2><input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /></div>
        <p className="muted small" style={{ margin: "4px 0 8px" }}>Tick people to find periods when all of them are free.</p>
        <div className="table-wrap">
          <table><thead><tr><th></th><th>Name</th><th>Load</th><th>Contact</th><th></th></tr></thead>
            <tbody>{list.map((f) => (
              <tr key={f.id}>
                <td><input type="checkbox" checked={sel.includes(f.id)} onChange={(e) => setSel(e.target.checked ? [...sel, f.id] : sel.filter((x) => x !== f.id))} title="Include in free-slot finder" /></td>
                <td><b>{f.name}</b><div className="muted small">{[f.id !== f.name ? f.id : "", f.department, f.designation, f.role !== "Faculty" ? f.role : "", f.onLeave ? "on leave" : ""].filter(Boolean).join(" · ")}</div></td>
                <td>{load(f.id)}/wk</td>
                <td className="small">{f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : <span className="muted">—</span>}{f.phone ? <div>{f.phone}</div> : null}</td>
                <td><button className="btn sm" onClick={() => setView(f.id)}>Timetable</button></td>
              </tr>
            ))}</tbody></table>
        </div>
      </div>
      <div className="stack">
        {viewing && (
          <div className="card">
            <div className="row between"><h2>{viewing.name}</h2><div className="row"><DownloadButton kind="faculty" id={viewing.id} label="Download" /><button className="btn sm" onClick={() => setView(null)}>Close</button></div></div>
            <TimetableGrid slots={data.slots.filter((s) => s.facultyIds.includes(viewing.id))} periods={data.periods} mode="faculty" onCell={onCell} />
          </div>
        )}
        <div className="card">
          <h2>Common free periods</h2>
          {sel.length === 0 ? <p className="muted">Nobody selected. Tick names in the directory.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Day</th><th>Free for {sel.map((id) => facultyName(data, id).split(" ").slice(-1)[0]).join(", ")}</th></tr></thead>
              <tbody>{free.map((r) => <tr key={r.d}><td><b>{r.d}</b></td><td>{r.periods.length ? r.periods.map((p) => `P${p}`).join(", ") : <span className="muted">none</span>}</td></tr>)}</tbody></table></div>
          )}
        </div>
      </div>
    </div>
  );
}
