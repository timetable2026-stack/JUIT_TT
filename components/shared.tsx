"use client";
import { DAYS, type Change, type Dataset, type Faculty, type Period, type Slot } from "@/lib/types";

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "");
export const fmtDay = (iso?: string) => (iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The clock the portal reads. A preview build may pin it to a chosen date; in production it is simply now. */
function clock(): Date {
  const pinned = typeof window !== "undefined" ? (window as any).__previewDate : undefined;
  return pinned ? new Date(`${pinned}T10:30:00+05:30`) : new Date();
}
export function todayDay(): (typeof DAYS)[number] | null {
  const d = clock().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });
  return (DAYS as readonly string[]).includes(d) ? (d as any) : null;
}
export function nowHHMM() {
  return clock().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

export function weekOfSemester(data: Dataset, semester?: string): string | null {
  const sem = semester ? data.semesters.find((s) => s.name === semester) : data.semesters[0];
  if (!sem) return null;
  const start = Date.parse(sem.startDate), end = Date.parse(sem.endDate), now = clock().getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (now < start) return `${sem.name} starts ${fmtDay(sem.startDate)}`;
  if (now > end) return `${sem.name} ended ${fmtDay(sem.endDate)}`;
  const week = Math.floor((now - start) / (7 * 86400000)) + 1, total = Math.ceil((end - start) / (7 * 86400000));
  return `Week ${week} of ${total}`;
}

export function facultyName(data: Dataset, id: string) {
  return data.faculty.find((f) => f.id === id)?.name ?? id;
}
/** Many course codes in the master sheet have no separate course name; show the name only when it adds something. */
export function subjectTitle(code: string, name?: string) {
  return name && name.trim() && name.trim() !== code.trim() ? name : "";
}

/** Batch strings can be long pools ("Other[25A11,…32 more]"). Short label for grids, full text in the modal. */
export function batchLabel(batch?: string): string {
  if (!batch) return "";
  const bucket = batch.match(/^([^[]+)\[(.*)\]$/);
  if (bucket) {
    const n = bucket[2].split(",").filter(Boolean).length;
    return `${bucket[1].trim()} (${n} batch${n === 1 ? "" : "es"})`;
  }
  const parts = batch.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length > 3) return `${parts[0]} +${parts.length - 1} more`;
  return parts.join(", ");
}

export function slotLabel(s: Slot) {
  const b = batchLabel(s.batch);
  return `${s.semester}${s.section ? " " + s.section : ""}${b ? " · " + b : ""}`;
}

/** Keys of slots touched by a set of changes (to outline them in the grid). */
export function changedKeys(changes: Change[]) {
  const set = new Set<string>();
  for (const c of changes) { if (c.after) set.add(c.after.key); if (c.before) set.add(c.before.key); }
  return set;
}

export function TimetableGrid({ slots, periods, mode, changed, onCell, showDays = DAYS }: { slots: Slot[]; periods: Period[]; mode: "faculty" | "class" | "room"; changed?: Set<string>; onCell?: (s: Slot) => void; showDays?: readonly string[] }) {
  const grid = new Map<string, Slot[]>();
  for (const s of slots) { const k = `${s.day}|${s.period}`; grid.set(k, [...(grid.get(k) ?? []), s]); }
  return (
    <div className="table-wrap">
      <table className="tt">
        <thead>
          <tr><th className="period">Period</th>{showDays.map((d) => <th key={d}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {periods.map((p) => p.isBreak ? (
            <tr key={p.number}><td className="period">{p.start}<small>{p.end}</small></td><td className="break" colSpan={showDays.length}>{p.label ?? "Break"}</td></tr>
          ) : (
            <tr key={p.number}>
              <td className="period">P{p.number}<small>{p.start}–{p.end}</small></td>
              {showDays.map((d) => {
                const here = grid.get(`${d}|${p.number}`) ?? [];
                return (
                  <td key={d}>
                    {here.length === 0 ? <div className="cell free">free</div> : here.map((s) => (
                      <div key={s.key} className={`cell ${s.type} ${changed?.has(s.key) ? "changed" : ""}`} onClick={() => onCell?.(s)} title={s.notes}>
                        <b>{s.subjectCode}{mode === "faculty" || mode === "room" ? ` · ${slotLabel(s)}` : ""}</b>
                        {subjectTitle(s.subjectCode, s.subjectName) && <span>{s.subjectName}</span>}
                        <span>{mode === "room" ? s.facultyIds.join(", ") : s.room}{s.type !== "Lecture" ? ` · ${s.type}` : ""}{mode === "class" && s.batch ? ` · ${s.batch}` : ""}</span>
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Excel download of a faculty member's, class's or room's week, in the department's own cell convention.
 *  A plain link on the deployed site; the preview build intercepts `data-export` and builds the file in the browser. */
export function DownloadButton({ kind, id, label = "Download", primary = false }: { kind: "faculty" | "section" | "room"; id: string; label?: string; primary?: boolean }) {
  const href = `/api/export?kind=${kind}&id=${encodeURIComponent(id)}`;
  return <a className={`btn sm ${primary ? "primary" : ""}`} href={href} data-export={kind} data-export-id={id} download title="Excel in the office's timetable layout">⬇ {label}</a>;
}

export function SlotModal({ slot, data, onClose }: { slot: Slot; data: Dataset; onClose: () => void }) {
  const sem = data.semesters.find((s) => s.name === slot.semester);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2>{slot.subjectCode}{subjectTitle(slot.subjectCode, slot.subjectName) ? ` — ${slot.subjectName}` : ""}</h2><button className="btn sm" onClick={onClose}>Close</button></div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>When</dt><dd>{slot.day}, Period {slot.period} ({slot.start}–{slot.end})</dd>
          <dt>Class</dt><dd>{slot.semester}{slot.section ? ` ${slot.section}` : ""}</dd>
          {slot.batch && <><dt>Batches</dt><dd style={{ wordBreak: "break-word" }}>{slot.batch.replace(/^([^[]+)\[(.*)\]$/, "$1: $2")}</dd></>}
          <dt>Type</dt><dd>{slot.type}</dd>
          <dt>Room</dt><dd>{slot.room}</dd>
          <dt>Faculty</dt><dd>{slot.facultyIds.map((id) => { const f = data.faculty.find((x) => x.id === id); return f ? `${f.name}${f.designation ? ` (${f.designation})` : ""}` : id; }).join("; ")}</dd>
          {slot.notes && <><dt>Notes</dt><dd>{slot.notes}</dd></>}
          {sem && <><dt>Semester</dt><dd>{fmtDay(sem.startDate)} – {fmtDay(sem.endDate)}{sem.examWindow ? ` · Exams: ${sem.examWindow}` : ""}</dd></>}
        </dl>
      </div>
    </div>
  );
}

export function FacultyPicker({ faculty, onPick, onClose, title = "Who are you?" }: { faculty: Faculty[]; onPick: (f: Faculty) => void; onClose?: () => void; title?: string }) {
  return (
    <PickerInner faculty={faculty} onPick={onPick} onClose={onClose} title={title} />
  );
}

import { useState } from "react";
function PickerInner({ faculty, onPick, onClose, title }: { faculty: Faculty[]; onPick: (f: Faculty) => void; onClose?: () => void; title: string }) {
  const [q, setQ] = useState("");
  const list = faculty.filter((f) => `${f.name} ${f.id} ${f.designation ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="muted small" style={{ margin: "6px 0 12px" }}>Pick your name once. This device will remember it; no password needed. You can switch any time.</p>
        <input type="search" placeholder="Search name or ID…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ marginBottom: 8 }} />
        <div className="name-picker">
          {list.map((f) => <button key={f.id} onClick={() => onPick(f)}>{f.name}<small>{f.designation ?? ""}{f.designation ? " · " : ""}{f.id}</small></button>)}
          {list.length === 0 && <div className="muted small" style={{ padding: 12 }}>No match.</div>}
        </div>
        {onClose && <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}><button className="btn sm" onClick={onClose}>Cancel</button></div>}
      </div>
    </div>
  );
}
