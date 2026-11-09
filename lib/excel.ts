// Parse + validate the master workbook. Framework-free: takes the sheets as
// arrays of row objects (what SheetJS' sheet_to_json returns), so the same code
// runs on the server, in tests and in the browser demo.

import { DAYS, SLOT_TYPES, type Dataset, type Day, type Faculty, type Issue, type Period, type Semester, type Slot, type SlotType } from "./types";

export type RawRow = Record<string, unknown>;
export interface RawSheets {
  Timetable: RawRow[];
  Faculty: RawRow[];
  Periods: RawRow[];
  Semesters: RawRow[];
}

export const REQUIRED_SHEETS = ["Timetable", "Faculty", "Periods", "Semesters"] as const;

// Column aliases: the header can be written in several common ways.
const COLS = {
  semester: ["semester", "sem"],
  section: ["section", "sec"],
  day: ["day"],
  period: ["period", "period no", "period number", "slot"],
  start: ["start", "start time", "from"],
  end: ["end", "end time", "to"],
  subjectCode: ["subject code", "course code", "code"],
  subjectName: ["subject name", "course name", "subject", "course"],
  type: ["type", "class type"],
  facultyId: ["faculty id", "faculty", "faculty ids", "teacher", "teacher id"],
  room: ["room", "venue", "room no"],
  batch: ["batch", "group"],
  notes: ["notes", "note", "remarks"],
  // Faculty sheet
  id: ["faculty id", "id", "emp id", "employee id"],
  name: ["full name", "name", "faculty name"],
  email: ["email", "email id", "e-mail"],
  department: ["department", "dept"],
  designation: ["designation", "post"],
  phone: ["phone", "mobile", "contact"],
  role: ["role"],
  onLeave: ["on leave", "leave"],
  // Periods sheet
  number: ["period", "period number", "number", "period no"],
  isBreak: ["break", "break flag", "is break"],
  label: ["label", "name"],
  // Semesters sheet
  semName: ["semester", "semester name", "name"],
  startDate: ["start date", "start", "from"],
  endDate: ["end date", "end", "to"],
  academicYear: ["academic year", "year", "session"],
  examWindow: ["exam window", "exams", "exam dates"],
} as const;

const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");

function pick(row: RawRow, keys: readonly string[]): string {
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(lower(k), row[k]);
  for (const k of keys) {
    const v = map.get(k);
    if (v !== undefined && v !== null && norm(v) !== "") return norm(v);
  }
  return "";
}

function hasColumn(rows: RawRow[], keys: readonly string[]): boolean {
  if (rows.length === 0) return false;
  const headers = new Set(Object.keys(rows[0]).map(lower));
  return keys.some((k) => headers.has(k));
}

// Excel stores times as fractions of a day; SheetJS may hand us a number, a
// Date, or a string. Normalise everything to "HH:MM".
export function toTime(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === "number") {
    const mins = Math.round((v % 1) * 24 * 60);
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const s = norm(v).toUpperCase();
  const m = s.match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?$/);
  if (!m) return s; // leave as-is; validator flags it
  let h = Number(m[1]);
  if (m[3] === "PM" && h < 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  return `${pad(h)}:${m[2]}`;
}

export function toISODate(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (1900 system)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = norm(v);
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${pad(Number(ymd[2]))}-${pad(Number(ymd[3]))}`;
  return s;
}

const pad = (n: number) => String(n).padStart(2, "0");

function normDay(s: string): Day | null {
  const l = s.toLowerCase().slice(0, 3);
  const found = DAYS.find((d) => d.toLowerCase() === l);
  return found ?? null;
}

function normType(s: string): SlotType | null {
  const l = s.toLowerCase();
  if (!l) return "Lecture";
  if (l.startsWith("lec") || l === "l" || l === "theory") return "Lecture";
  if (l.startsWith("lab") || l === "p" || l === "practical") return "Lab";
  if (l.startsWith("tut") || l === "t") return "Tutorial";
  if (l.startsWith("sem")) return "Seminar";
  if (l.startsWith("proj")) return "Project";
  const exact = SLOT_TYPES.find((t) => t.toLowerCase() === l);
  return exact ?? null;
}

/** Natural identity of a scheduled class. Subject + type are part of it because a
 *  batch pool can run several parallel electives in one slot (students pick one). */
export function slotKey(s: { semester: string; section: string; day: string; period: number; batch?: string; subjectCode: string; type: string }) {
  return [s.semester, s.section || "-", s.day, s.period, s.batch || "-", s.subjectCode, s.type].join("|");
}

/** Faculty codes that stand for "not assigned yet" — never clash-checked. */
export const PLACEHOLDER_FACULTY = new Set(["TBA", "TBD", "NA", "N/A", "-", "XXX", "STAFF"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParseResult {
  data: Dataset;
  issues: Issue[];
  ok: boolean; // false when any error-level issue exists
}

/** Parse the four sheets into a Dataset and run every validation rule. */
export function parseSheets(sheets: Partial<RawSheets>): ParseResult {
  const issues: Issue[] = [];
  const err = (sheet: string, message: string, row?: number, column?: string) => issues.push({ level: "error", sheet, row, column, message });
  const warn = (sheet: string, message: string, row?: number, column?: string) => issues.push({ level: "warning", sheet, row, column, message });

  for (const name of REQUIRED_SHEETS) {
    if (!sheets[name]) err(name, `Sheet "${name}" is missing. The workbook needs sheets named Timetable, Faculty, Periods and Semesters.`);
  }
  const tt = sheets.Timetable ?? [];
  const fac = sheets.Faculty ?? [];
  const per = sheets.Periods ?? [];
  const sem = sheets.Semesters ?? [];

  // ---- Faculty
  const faculty: Faculty[] = [];
  const facById = new Map<string, Faculty>();
  const emailOwner = new Map<string, string>();
  if (fac.length && !hasColumn(fac, COLS.id)) err("Faculty", 'Column "Faculty ID" is missing.');
  if (fac.length && !hasColumn(fac, COLS.email)) err("Faculty", 'Column "Email" is missing.');
  fac.forEach((r, i) => {
    const row = i + 2;
    const id = pick(r, COLS.id).toUpperCase();
    const name = pick(r, COLS.name);
    const email = pick(r, COLS.email).toLowerCase();
    if (!id && !name && !email) return; // blank row
    if (!id) return err("Faculty", "Faculty ID is empty.", row, "Faculty ID");
    if (facById.has(id)) return err("Faculty", `Faculty ID ${id} appears twice.`, row, "Faculty ID");
    if (!name) warn("Faculty", `No name for ${id} yet — the portal shows the code until the Full name column is filled.`, row, "Full name");
    if (!email) warn("Faculty", `No email for ${id} — they can use the portal, but cannot be emailed when their classes change.`, row, "Email");
    else if (!EMAIL_RE.test(email)) err("Faculty", `Email "${email}" is not a valid address.`, row, "Email");
    else if (emailOwner.has(email)) err("Faculty", `Email ${email} is used by both ${emailOwner.get(email)} and ${id}.`, row, "Email");
    else emailOwner.set(email, id);
    const roleRaw = pick(r, COLS.role).toLowerCase();
    const role = roleRaw.startsWith("admin") ? "Admin" : roleRaw.startsWith("hod") || roleRaw.includes("head") ? "HOD" : "Faculty";
    const f: Faculty = {
      id,
      name: name || id,
      email,
      department: pick(r, COLS.department) || undefined,
      designation: pick(r, COLS.designation) || undefined,
      phone: pick(r, COLS.phone) || undefined,
      role,
      onLeave: /^(y|yes|true|1)$/i.test(pick(r, COLS.onLeave)) || undefined,
    };
    faculty.push(f);
    facById.set(id, f);
  });

  // ---- Periods
  const periods: Period[] = [];
  const perByNo = new Map<number, Period>();
  per.forEach((r, i) => {
    const row = i + 2;
    const nRaw = pick(r, COLS.number);
    if (!nRaw) return;
    const n = Number(nRaw);
    if (!Number.isInteger(n) || n <= 0) return err("Periods", `Period number "${nRaw}" must be a positive whole number.`, row, "Period");
    if (perByNo.has(n)) return err("Periods", `Period ${n} is listed twice.`, row, "Period");
    const start = toTime(pickRaw(r, COLS.start));
    const end = toTime(pickRaw(r, COLS.end));
    if (!/^\d{2}:\d{2}$/.test(start)) err("Periods", `Start time "${start}" for period ${n} is not a time (use HH:MM).`, row, "Start");
    if (!/^\d{2}:\d{2}$/.test(end)) err("Periods", `End time "${end}" for period ${n} is not a time (use HH:MM).`, row, "End");
    if (start >= end) err("Periods", `Period ${n} ends (${end}) before it starts (${start}).`, row);
    const p: Period = { number: n, start, end, isBreak: /^(y|yes|true|1)$/i.test(pick(r, COLS.isBreak)) || undefined, label: pick(r, COLS.label) || undefined };
    periods.push(p);
    perByNo.set(n, p);
  });
  periods.sort((a, b) => a.number - b.number);
  if (per.length && periods.length === 0) err("Periods", "No periods were read. Check the column headings (Period, Start, End).");

  // ---- Semesters
  const semesters: Semester[] = [];
  const semByName = new Map<string, Semester>();
  sem.forEach((r, i) => {
    const row = i + 2;
    const name = pick(r, COLS.semName);
    if (!name) return;
    if (semByName.has(name)) return err("Semesters", `Semester "${name}" is listed twice.`, row, "Semester");
    const startDate = toISODate(pickRaw(r, COLS.startDate));
    const endDate = toISODate(pickRaw(r, COLS.endDate));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) err("Semesters", `Start date "${startDate}" for ${name} is not a date.`, row, "Start date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) err("Semesters", `End date "${endDate}" for ${name} is not a date.`, row, "End date");
    const s: Semester = { name, startDate, endDate, academicYear: pick(r, COLS.academicYear) || undefined, examWindow: pick(r, COLS.examWindow) || undefined };
    semesters.push(s);
    semByName.set(name, s);
  });

  // ---- Timetable
  const slots: Slot[] = [];
  const byKey = new Map<string, Slot>();
  const facBusy = new Map<string, Slot>(); // facultyId|day|period -> slot
  const roomBusy = new Map<string, Slot>(); // room|day|period -> slot
  const subjectNames = new Map<string, Set<string>>();
  const perDayLoad = new Map<string, number>(); // facultyId|day -> count
  const breakUsed = new Map<number, number>(); // period -> classes scheduled in a break period

  for (const [key, cols] of Object.entries({ Semester: COLS.semester, Day: COLS.day, Period: COLS.period, "Subject code": COLS.subjectCode, "Faculty ID": COLS.facultyId, Room: COLS.room })) {
    if (tt.length && !hasColumn(tt, cols)) err("Timetable", `Column "${key}" is missing.`);
  }

  tt.forEach((r, i) => {
    const row = i + 2;
    const semester = pick(r, COLS.semester);
    const dayRaw = pick(r, COLS.day);
    const periodRaw = pick(r, COLS.period);
    const subjectCode = pick(r, COLS.subjectCode).toUpperCase();
    if (!semester && !dayRaw && !periodRaw && !subjectCode) return; // blank row

    const day = normDay(dayRaw);
    const period = Number(periodRaw);
    const typeRaw = pick(r, COLS.type);
    const type = normType(typeRaw);
    const facultyIds = pick(r, COLS.facultyId).split(/[;,/&+]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const room = pick(r, COLS.room);
    const section = pick(r, COLS.section);
    const batch = pick(r, COLS.batch) || undefined;
    const subjectName = pick(r, COLS.subjectName);

    let bad = false;
    if (!semester) { err("Timetable", "Semester is empty.", row, "Semester"); bad = true; }
    else if (semesters.length && !semByName.has(semester)) { err("Timetable", `Semester "${semester}" is not in the Semesters sheet.`, row, "Semester"); bad = true; }
    if (!day) { err("Timetable", `Day "${dayRaw}" is not one of Mon–Sat.`, row, "Day"); bad = true; }
    if (!Number.isInteger(period) || period <= 0) { err("Timetable", `Period "${periodRaw}" must be a number.`, row, "Period"); bad = true; }
    else if (periods.length && !perByNo.has(period)) { err("Timetable", `Period ${period} is not in the Periods sheet.`, row, "Period"); bad = true; }
    if (!subjectCode) { err("Timetable", "Subject code is empty.", row, "Subject code"); bad = true; }
    if (!type) { err("Timetable", `Type "${typeRaw}" is not Lecture, Lab, Tutorial, Seminar or Project.`, row, "Type"); bad = true; }
    if (facultyIds.length === 0) { err("Timetable", "Faculty ID is empty.", row, "Faculty ID"); bad = true; }
    for (const fid of facultyIds) if (faculty.length && !facById.has(fid) && !PLACEHOLDER_FACULTY.has(fid)) { err("Timetable", `Faculty ID ${fid} is not in the Faculty sheet.`, row, "Faculty ID"); bad = true; }
    if (!room) { err("Timetable", "Room is empty.", row, "Room"); bad = true; }
    if (bad || !day || !type) return;

    const p = perByNo.get(period);
    const slot: Slot = {
      key: slotKey({ semester, section, day, period, batch, subjectCode, type }),
      semester, section, day, period,
      start: toTime(pickRaw(r, COLS.start)) || p?.start,
      end: toTime(pickRaw(r, COLS.end)) || p?.end,
      subjectCode, subjectName, type, facultyIds, room, batch,
      notes: pick(r, COLS.notes) || undefined,
      sourceRow: row,
    };

    const dup = byKey.get(slot.key);
    if (dup) {
      err("Timetable", `${semester}${section ? " " + section : ""} lists ${subjectCode} (${type}) for batch ${batch || "—"} on ${day} P${period} twice (also row ${dup.sourceRow}).`, row);
      return;
    }
    byKey.set(slot.key, slot);

    for (const fid of facultyIds) {
      if (PLACEHOLDER_FACULTY.has(fid)) continue;
      const k = `${fid}|${day}|${period}`;
      const other = facBusy.get(k);
      if (other && !(other.subjectCode === subjectCode && other.room === room)) {
        err("Timetable", `${facById.get(fid)?.name ?? fid} is in two places on ${day} P${period}: ${other.semester} ${other.subjectCode} in ${other.room} (row ${other.sourceRow}) and ${semester} ${subjectCode} in ${room}.`, row, "Faculty ID");
      } else facBusy.set(k, slot);
      const dk = `${fid}|${day}`;
      perDayLoad.set(dk, (perDayLoad.get(dk) ?? 0) + 1);
    }
    const rk = `${room.toLowerCase()}|${day}|${period}`;
    const otherRoom = roomBusy.get(rk);
    if (otherRoom && !(otherRoom.subjectCode === subjectCode && sameFaculty(otherRoom.facultyIds, facultyIds))) {
      err("Timetable", `Room ${room} is booked twice on ${day} P${period}: ${otherRoom.semester} ${otherRoom.subjectCode} (row ${otherRoom.sourceRow}) and ${semester} ${subjectCode}.`, row, "Room");
    } else roomBusy.set(rk, slot);

    if (subjectName) {
      const nk = `${subjectCode} (${type})`;
      const set = subjectNames.get(nk) ?? new Set<string>();
      set.add(subjectName);
      subjectNames.set(nk, set);
    }
    if (p?.isBreak) breakUsed.set(period, (breakUsed.get(period) ?? 0) + 1);
    slots.push(slot);
  });

  for (const [p, n] of breakUsed) warn("Periods", `Period ${p} is marked as a break but ${n} class${n === 1 ? " is" : "es are"} scheduled in it. Clear the Break flag if it is a teaching period.`, undefined, "Break");
  for (const [code, names] of subjectNames) if (names.size > 1) warn("Timetable", `Subject ${code} appears with ${names.size} different names: ${[...names].join(" / ")}.`);
  for (const [k, n] of perDayLoad) {
    if (n > 6) { const [fid, day] = k.split("|"); warn("Timetable", `${facById.get(fid)?.name ?? fid} has ${n} periods on ${day}.`); }
  }
  const scheduled = new Set(slots.flatMap((s) => s.facultyIds));
  for (const f of faculty) if (!scheduled.has(f.id) && f.role === "Faculty") warn("Faculty", `${f.name} (${f.id}) has no classes in this timetable.`);

  if (tt.length && slots.length === 0 && !issues.some((i) => i.level === "error")) err("Timetable", "No class rows were read.");

  slots.sort((a, b) => a.semester.localeCompare(b.semester) || a.section.localeCompare(b.section) || DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period);

  return { data: { faculty, periods, semesters, slots }, issues, ok: !issues.some((i) => i.level === "error") };
}

function pickRaw(row: RawRow, keys: readonly string[]): unknown {
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(lower(k), row[k]);
  for (const k of keys) {
    const v = map.get(k);
    if (v !== undefined && v !== null && norm(v) !== "") return v;
  }
  return "";
}

function sameFaculty(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Every sheet as a plain 2-D array of trimmed strings, for grid detection and conversion. */
export function workbookToCells(XLSX: any, wb: any): { name: string; cells: string[][] }[] {
  return wb.SheetNames.map((name: string) => {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true });
    return { name, cells: rows.map((r) => (r ?? []).map((v) => (v === undefined || v === null ? "" : String(v).trim()))) };
  });
}

/** Convert a SheetJS workbook into RawSheets. `XLSX` is injected so this works server-side and in the browser. */
export function workbookToSheets(XLSX: any, wb: any): Partial<RawSheets> {
  const out: Partial<RawSheets> = {};
  for (const name of REQUIRED_SHEETS) {
    const sheetName = wb.SheetNames.find((n: string) => n.trim().toLowerCase() === name.toLowerCase());
    if (!sheetName) continue;
    out[name] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true }) as RawRow[];
  }
  return out;
}

/** The blank template as sheet arrays (header row + example row), for XLSX.utils.aoa_to_sheet. */
export function templateSheets(): Record<string, (string | number)[][]> {
  return {
    Timetable: [
      ["Semester", "Section", "Day", "Period", "Start", "End", "Subject code", "Subject name", "Type", "Faculty ID", "Room", "Batch", "Notes"],
      ["Sem 3", "A", "Mon", 1, "09:00", "09:50", "CS301", "Data Structures", "Lecture", "FAC001", "LH-1", "", ""],
      ["Sem 3", "A", "Mon", 2, "", "", "CS302", "Discrete Mathematics", "Lecture", "FAC002", "LH-1", "", "Start/End optional: filled from Periods"],
      ["Sem 3", "A", "Tue", 5, "", "", "CS305", "Data Structures Lab", "Lab", "FAC001;FAC003", "Lab-2", "B1", "Two faculty separated by ;"],
    ],
    Faculty: [
      ["Faculty ID", "Full name", "Email", "Department", "Designation", "Phone", "Role"],
      ["FAC001", "Dr. Example One", "example.one@juitsolan.ac.in", "CSE", "Assistant Professor", "", "Faculty"],
      ["FAC002", "Dr. Example Two", "example.two@juitsolan.ac.in", "CSE", "Professor", "", "HOD"],
    ],
    Periods: [
      ["Period", "Start", "End", "Break", "Label"],
      [1, "09:00", "09:50", "", ""],
      [2, "10:00", "10:50", "", ""],
      [3, "11:00", "11:50", "", ""],
      [4, "12:00", "12:50", "", ""],
      [5, "13:00", "13:50", "Yes", "Lunch"],
      [6, "14:00", "14:50", "", ""],
      [7, "15:00", "15:50", "", ""],
      [8, "16:00", "16:50", "", ""],
    ],
    Semesters: [
      ["Semester", "Start date", "End date", "Academic year", "Exam window"],
      ["Sem 3", "2026-07-20", "2026-12-05", "2026-27", "8 Dec – 20 Dec 2026"],
    ],
  };
}
