// Excel export of one person's (or one class's, or one room's) week in the
// department's own conventions: a day x period grid whose cells read
// CODE/BATCH/ROOM, plus the single "Faculty view" row (Faculty, Dept, Periods/wk,
// MON P1 ... SAT P8) that pastes straight back into the master workbook.
// Framework-free: returns arrays of arrays for XLSX.utils.aoa_to_sheet.

import { DAYS, type Dataset, type Slot } from "./types";

export type ExportKind = "faculty" | "class" | "room";

export interface ExportSpec {
  kind: ExportKind;
  /** faculty id, "semester|section" or room name. */
  id: string;
}

const DAY_UP: Record<string, string> = { Mon: "MON", Tue: "TUE", Wed: "WED", Thu: "THU", Fri: "FRI", Sat: "SAT" };

/** The master-workbook cell convention for one class. */
export function cellText(s: Slot, kind: ExportKind): string {
  const batch = s.batch ?? "";
  if (kind === "room") return [s.subjectCode, batch, s.facultyIds.join("+")].filter(Boolean).join("/");
  if (kind === "class") return [s.subjectCode, s.facultyIds.join("+"), s.room].filter(Boolean).join("/");
  return [s.subjectCode, batch, s.room].filter(Boolean).join("/");
}

export function selectSlots(data: Dataset, spec: ExportSpec): Slot[] {
  if (spec.kind === "faculty") return data.slots.filter((s) => s.facultyIds.includes(spec.id));
  if (spec.kind === "room") return data.slots.filter((s) => s.room === spec.id);
  const [sem, sec] = spec.id.split("|");
  return data.slots.filter((s) => s.semester === sem && (s.section ?? "") === (sec ?? ""));
}

export function exportTitle(data: Dataset, spec: ExportSpec): string {
  if (spec.kind === "faculty") { const f = data.faculty.find((x) => x.id === spec.id); return f ? (f.name !== f.id ? `${f.name} (${f.id})` : f.id) : spec.id; }
  if (spec.kind === "room") return `Room ${spec.id}`;
  return spec.id.replace("|", " ").trim();
}

export interface ExportSheets {
  grid: (string | number)[][];
  row: (string | number)[][];
  list: (string | number)[][];
  fileName: string;
}

export function buildExport(data: Dataset, spec: ExportSpec, versionId: number): ExportSheets {
  const slots = selectSlots(data, spec).sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period);
  const periods = data.periods;
  const title = exportTitle(data, spec);
  const at = new Map<string, Slot[]>();
  for (const s of slots) { const k = `${s.day}|${s.period}`; at.set(k, [...(at.get(k) ?? []), s]); }
  const join = (k: string) => (at.get(k) ?? []).map((s) => cellText(s, spec.kind)).join(" ; ");

  // Sheet 1: readable grid, days down, periods across.
  const grid: (string | number)[][] = [];
  grid.push([`${title} — weekly timetable`]);
  grid.push([`Version ${versionId}`, "", `${slots.length} periods/week`]);
  grid.push([]);
  grid.push(["Day", ...periods.map((p) => `P${p.number}`)]);
  grid.push(["", ...periods.map((p) => `${p.start}-${p.end}`)]);
  for (const d of DAYS) grid.push([DAY_UP[d], ...periods.map((p) => join(`${d}|${p.number}`))]);
  grid.push([]);
  grid.push(["Cell format:", spec.kind === "faculty" ? "Course code / Batch / Room" : spec.kind === "class" ? "Course code / Faculty / Room" : "Course code / Batch / Faculty"]);

  // Sheet 2: the master workbook's "Faculty view" row.
  const header = ["Faculty", "Dept", "Periods/wk", ...DAYS.flatMap((d) => periods.map((p) => `${DAY_UP[d]} P${p.number}`))];
  const f = spec.kind === "faculty" ? data.faculty.find((x) => x.id === spec.id) : undefined;
  const rowVals = [f?.id ?? title, f?.department ?? "", slots.length, ...DAYS.flatMap((d) => periods.map((p) => join(`${d}|${p.number}`)))];
  const row = [header, rowVals];

  // Sheet 3: plain list, one class per line, for anyone who prefers it.
  const list: (string | number)[][] = [["Day", "Period", "Start", "End", "Course code", "Course name", "Type", "Group", "Batch", "Faculty", "Room", "Notes"]];
  for (const s of slots) list.push([s.day, s.period, s.start ?? "", s.end ?? "", s.subjectCode, s.subjectName !== s.subjectCode ? s.subjectName : "", s.type, s.semester, s.batch ?? "", s.facultyIds.join(";"), s.room, s.notes ?? ""]);

  const safe = title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return { grid, row, list, fileName: `Timetable_${safe}_v${versionId}.xlsx` };
}

/** Column widths for the grid sheet, in characters. */
export const GRID_WIDTHS = [8, ...Array(8).fill(26)];

/** Build a workbook with SheetJS (injected so this runs on server and in the browser). */
export function toWorkbook(XLSX: any, ex: ExportSheets) {
  const wb = XLSX.utils.book_new();
  const g = XLSX.utils.aoa_to_sheet(ex.grid);
  g["!cols"] = GRID_WIDTHS.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, g, "Weekly grid");
  const r = XLSX.utils.aoa_to_sheet(ex.row);
  r["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 10 }, ...Array(48).fill({ wch: 24 })];
  XLSX.utils.book_append_sheet(wb, r, "Faculty view row");
  const l = XLSX.utils.aoa_to_sheet(ex.list);
  l["!cols"] = [6, 7, 7, 7, 14, 34, 10, 9, 28, 14, 12, 20].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, l, "List");
  return wb;
}
