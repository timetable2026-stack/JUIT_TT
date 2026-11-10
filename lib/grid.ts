// Reads the department's own grid-format master timetable — one sheet per year
// group, days down the page and periods across — and turns it into the row
// format the portal stores. This is what lets the office upload the file it
// already maintains instead of reformatting anything by hand.
//
// Expected shape (as in Timetable_Jan_Jun_2027.xlsx):
//   row 1  merged time headers every N columns, e.g. "09:00-10:00"
//   row 2  repeating sub-headers: L-T-P | Sub Code | Batch | Faculty | Room
//   col B  the day name, merged down that day's block of parallel-class rows
// Plus optional reference sheets: "Faculty view" (codes + department) and
// "DLC fallbacks" / "Not placed" (course codes with their course names).

import type { RawRow, RawSheets } from "./excel";

const DAY_WORDS: Record<string, string> = {
  MON: "Mon", MONDAY: "Mon", TUE: "Tue", TUES: "Tue", TUESDAY: "Tue",
  WED: "Wed", WEDNESDAY: "Wed", THU: "Thu", THUR: "Thu", THURS: "Thu", THURSDAY: "Thu",
  FRI: "Fri", FRIDAY: "Fri", SAT: "Sat", SATURDAY: "Sat",
};
const TYPE_WORDS: Record<string, string> = {
  L: "Lecture", LEC: "Lecture", LECTURE: "Lecture", TH: "Lecture", THEORY: "Lecture",
  T: "Tutorial", TUT: "Tutorial", TUTORIAL: "Tutorial",
  P: "Lab", PR: "Lab", PRAC: "Lab", LAB: "Lab", PRACTICAL: "Lab",
  S: "Seminar", SEM: "Seminar", SEMINAR: "Seminar", PROJ: "Project", PROJECT: "Project",
};
/** Sheets that are reference material or reports, never class grids. */
const NON_GRID_SHEETS = new Set([
  "faculty view", "room view", "elective slots", "checks and utilisation", "checks and utilization",
  "faculty load", "not placed", "dlc fallbacks", "data corrections", "legend", "notes", "summary",
  "timetable", "faculty", "periods", "semesters",
]);

export interface GridSheetCells {
  name: string;
  /** cells[r][c] — 0-based, already stringified and trimmed. */
  cells: string[][];
}

export interface GridResult {
  sheets: Partial<RawSheets>;
  /** What the converter did, shown to the admin so the import is never a black box. */
  report: { sheet: string; day: string; classes: number }[];
  notes: string[];
  groups: string[];
}

const TIME_RE = /^(\d{1,2}[:.]\d{2})\s*(?:[-–—]|to)\s*(\d{1,2}[:.]\d{2})$/i;

function norm(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}
function pad(t: string): string {
  const [h, m] = t.replace(".", ":").split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/** True when this sheet looks like a day×period class grid rather than a list or report. */
export function looksLikeGrid(sheet: GridSheetCells): boolean {
  if (NON_GRID_SHEETS.has(sheet.name.trim().toLowerCase())) return false;
  const row0 = sheet.cells[0] ?? [];
  const timeHeaders = row0.filter((v) => TIME_RE.test(norm(v))).length;
  if (timeHeaders < 2) return false;
  // and a day word somewhere in the first few columns
  for (let r = 1; r < Math.min(sheet.cells.length, 60); r++) {
    for (let c = 0; c < Math.min(4, (sheet.cells[r] ?? []).length); c++) {
      if (DAY_WORDS[norm(sheet.cells[r][c]).toUpperCase()]) return true;
    }
  }
  return false;
}

/** Column index of each time header, in order, with its period number and times. */
function periodColumns(sheet: GridSheetCells) {
  const row0 = sheet.cells[0] ?? [];
  const found: { start: string; end: string; col: number }[] = [];
  for (let c = 0; c < row0.length; c++) {
    const m = norm(row0[c]).match(TIME_RE);
    if (m) found.push({ start: pad(m[1]), end: pad(m[2]), col: c });
  }
  found.sort((a, b) => a.col - b.col);
  return found.map((f, i) => ({ period: i + 1, ...f }));
}

/** Which of the five sub-columns under a time header holds what, read from row 2. */
function subColumnMap(sheet: GridSheetCells, firstCol: number, width: number) {
  const row1 = sheet.cells[1] ?? [];
  const map: Record<string, number> = {};
  for (let i = 0; i < width; i++) {
    const h = norm(row1[firstCol + i]).toLowerCase().replace(/[^a-z]/g, "");
    if (!h) continue;
    if (/^(ltp|type|cls|classtype)$/.test(h)) map.type = i;
    else if (/(subcode|coursecode|code|subject)/.test(h) && map.code === undefined) map.code = i;
    else if (/(batch|group|section)/.test(h)) map.batch = i;
    else if (/(faculty|teacher|staff|instructor)/.test(h)) map.faculty = i;
    else if (/(room|venue|hall|location)/.test(h)) map.room = i;
  }
  // Fall back to the conventional order when row 2 is blank or unrecognised.
  if (map.code === undefined) map.code = 1;
  if (map.type === undefined) map.type = 0;
  if (map.batch === undefined) map.batch = 2;
  if (map.faculty === undefined) map.faculty = 3;
  if (map.room === undefined) map.room = 4;
  return map;
}

/** Day name per row, carried down through the merged day column. */
function dayByRow(sheet: GridSheetCells): (string | null)[] {
  const out: (string | null)[] = [];
  let current: string | null = null;
  for (let r = 0; r < sheet.cells.length; r++) {
    for (let c = 0; c < Math.min(4, (sheet.cells[r] ?? []).length); c++) {
      const d = DAY_WORDS[norm(sheet.cells[r][c]).toUpperCase()];
      if (d) { current = d; break; }
    }
    out[r] = current;
  }
  return out;
}

export function splitFacultyCodes(raw: string): string[] {
  // "JBSW_RS13" is one code; "NSA;DGA", "NSA + DGA", "NSA/DGA" are several.
  return raw.split(/[;,&+/]|\sand\s/i).map((p) => p.trim()).filter(Boolean);
}

/** code -> course name, read from reference sheets whose header row names a course column
 *  ("Course", "Course name", "Subject name") beside a code column ("Course code", "Code kept"). */
function courseNames(all: GridSheetCells[]): Map<string, string> {
  const names = new Map<string, string>();
  const NAME_HDR = /^(course|subject)(\s*(name|title))?$/i;
  const CODE_HDR = /^((course|subject)\s*code|code(\s*kept)?)$/i;
  const CODE_RE = /^[0-9A-Z][0-9A-Z_/-]{3,}$/;
  for (const sheet of all) {
    if (looksLikeGrid(sheet)) continue;
    for (let h = 0; h < Math.min(6, sheet.cells.length); h++) {
      const row = sheet.cells[h] ?? [];
      const nameCol = row.findIndex((c) => NAME_HDR.test(norm(c)));
      const codeCols = row.map((c, i) => (CODE_HDR.test(norm(c)) ? i : -1)).filter((i) => i >= 0);
      if (nameCol < 0 || codeCols.length === 0) continue;
      for (let r = h + 1; r < sheet.cells.length; r++) {
        const name = norm(sheet.cells[r]?.[nameCol]);
        if (name.length < 3 || !/[a-z]/i.test(name) || CODE_RE.test(name.toUpperCase()) && !/\s/.test(name)) continue;
        for (const c of codeCols) {
          const code = norm(sheet.cells[r]?.[c]).toUpperCase();
          if (CODE_RE.test(code) && !/X{3,}/.test(code) && !names.has(code)) names.set(code, name);
        }
      }
      break; // one header row per sheet
    }
  }
  return names;
}

/** faculty code -> department, from a "Faculty view"-style sheet. */
function facultyDepartments(all: GridSheetCells[]): Map<string, string> {
  const dept = new Map<string, string>();
  for (const sheet of all) {
    if (!/faculty/i.test(sheet.name)) continue;
    let headerRow = -1;
    for (let r = 0; r < Math.min(8, sheet.cells.length); r++) {
      if (/^faculty/i.test(norm(sheet.cells[r]?.[0]))) { headerRow = r; break; }
    }
    if (headerRow < 0) continue;
    for (let r = headerRow + 1; r < sheet.cells.length; r++) {
      const code = norm(sheet.cells[r]?.[0]);
      if (code && !dept.has(code)) dept.set(code, norm(sheet.cells[r]?.[1]));
    }
  }
  return dept;
}

export interface TermDates { start: string; end: string; year?: string; exams?: string }

/** Convert every grid sheet in the workbook into the portal's four row sheets. */
export function gridToSheets(all: GridSheetCells[], term: TermDates): GridResult {
  const names = courseNames(all);
  const depts = facultyDepartments(all);
  const timetable: RawRow[] = [];
  const report: GridResult["report"] = [];
  const notes: string[] = [];
  const usedFaculty = new Set<string>();
  const periodTimes = new Map<number, { start: string; end: string }>();
  const groups: string[] = [];

  for (const sheet of all) {
    if (!looksLikeGrid(sheet)) continue;
    const periods = periodColumns(sheet);
    if (periods.length < 2) continue;
    const group = sheet.name.trim().replace(/\s+/g, " ").replace(/^Year(\d)$/i, "Year $1");
    groups.push(group);
    const width = periods.length > 1 ? periods[1].col - periods[0].col : 5;
    const sub = subColumnMap(sheet, periods[0].col, width);
    const days = dayByRow(sheet);
    const perDay = new Map<string, number>();

    for (const p of periods) periodTimes.set(p.period, { start: p.start, end: p.end });

    for (let r = 2; r < sheet.cells.length; r++) {
      const day = days[r];
      if (!day) continue;
      const row = sheet.cells[r] ?? [];
      for (const p of periods) {
        const at = (k: keyof typeof sub) => norm(row[p.col + (sub[k] as number)]);
        const code = at("code").toUpperCase();
        const fac = at("faculty");
        if (!code && !fac) continue;
        if (!code) { notes.push(`${sheet.name} row ${r + 1}, ${day} P${p.period}: faculty "${fac}" with no course code — skipped.`); continue; }
        const ltp = at("type").toUpperCase().replace(/[^A-Z]/g, "");
        const ids = splitFacultyCodes(fac);
        ids.forEach((i) => usedFaculty.add(i));
        timetable.push({
          Semester: group, Section: "", Day: day, Period: p.period, Start: p.start, End: p.end,
          "Subject code": code, "Subject name": names.get(code) ?? code,
          Type: TYPE_WORDS[ltp] ?? "Lecture",
          "Faculty ID": ids.join(";"), Room: at("room") || "TBA", Batch: at("batch"), Notes: "",
        });
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
    }
    for (const [day, n] of perDay) report.push({ sheet: group, day, classes: n });
  }

  const faculty: RawRow[] = [...usedFaculty].sort().map((code) => ({
    "Faculty ID": code, "Full name": code, Email: "", Department: depts.get(code) ?? "",
    Designation: "", Phone: "", Role: "Faculty",
  }));
  const periodsOut: RawRow[] = [...periodTimes.entries()].sort((a, b) => a[0] - b[0])
    .map(([n, t]) => ({ Period: n, Start: t.start, End: t.end, Break: "", Label: "" }));
  const semesters: RawRow[] = [...new Set(groups)].map((g) => ({
    Semester: g, "Start date": term.start, "End date": term.end,
    "Academic year": term.year ?? "", "Exam window": term.exams ?? "",
  }));

  return { sheets: { Timetable: timetable, Faculty: faculty, Periods: periodsOut, Semesters: semesters }, report, notes, groups: [...new Set(groups)] };
}

/** Carry names, emails and other office-maintained fields from the live version onto a fresh grid import. */
export function mergeFacultyDetails(fresh: RawRow[], previous: { id: string; name: string; email: string; department?: string; designation?: string; phone?: string; role: string }[]): { rows: RawRow[]; carried: number } {
  const prev = new Map(previous.map((f) => [f.id, f]));
  let carried = 0;
  const rows = fresh.map((r) => {
    const p = prev.get(String(r["Faculty ID"]));
    if (!p) return r;
    const keptName = p.name && p.name !== p.id;
    if (keptName || p.email) carried++;
    return {
      ...r,
      "Full name": keptName ? p.name : r["Full name"],
      Email: p.email || r.Email,
      Department: p.department || r.Department,
      Designation: p.designation || r.Designation,
      Phone: p.phone || r.Phone,
      Role: p.role || r.Role,
    };
  });
  return { rows, carried };
}

/** Default term dates when a grid workbook carries none: the current or next Jan–Jun / Jul–Dec window. */
export function guessTerm(today = new Date()): TermDates {
  const y = today.getFullYear();
  const spring = today.getMonth() <= 5; // Jan–Jun
  return spring
    ? { start: `${y}-01-04`, end: `${y}-06-04`, year: `${y - 1}-${String(y).slice(2)}` }
    : { start: `${y}-07-20`, end: `${y}-12-05`, year: `${y}-${String(y + 1).slice(2)}` };
}
