// Excel downloads in the TTC's own "Faculty Timetable" layout: one sheet of
// stacked 9-row blocks (header · time row · MON–SAT), cells written as
// "L-CODE / BATCH / (ROOM)", LUNCH in the 12:00 slot when free, "--" for the
// end-of-day column and Saturday afternoons, thin borders, grey header band.
// The same block serves one faculty member, one section (batch) or one room,
// and "all" stacks every block of that kind into a single sheet.

import { DAYS, type Dataset, type Faculty, type Slot } from "./types";
import type { Cell, Row, Workbook } from "./xlsxWriter";

export type ExportKind = "faculty" | "section" | "room";
export interface ExportSpec { kind: ExportKind; id: string } // id = code, batch, room, or "all"

const TYPE_LETTER: Record<string, string> = { Lecture: "L", Lab: "P", Tutorial: "T", Seminar: "S", Project: "PR" };
const DAY_UP: Record<string, string> = { Mon: "MON", Tue: "TUE", Wed: "WED", Thu: "THU", Fri: "FRI", Sat: "SAT" };

// Style indexes (see STYLES below).
const S = { none: 0, header: 1, time: 2, day: 3, cell: 4, filler: 5, lunch: 6, sep: 7, title: 8 } as const;
export const STYLES: Workbook["styles"] = [
  {},
  { bold: true, size: 9, fill: "D9D9D9", border: true, align: "center", wrap: true },   // header band
  { bold: true, size: 9, border: true, align: "center", wrap: true },                   // time labels
  { bold: true, size: 10, border: true, align: "center", wrap: true },                  // MON..SAT
  { size: 8, border: true, align: "center", wrap: true },                               // class cell
  { size: 8, color: "808080", fill: "F2F2F2", border: true, align: "center", wrap: true },            // "--"
  { bold: true, size: 8, color: "808080", fill: "F2F2F2", border: true, align: "center", wrap: true }, // LUNCH
  { size: 8, color: "808080", align: "center" },                                        // ~~~ separator
  { bold: true, size: 11, align: "left" },                                              // sheet title (unused in blocks)
];

/** "9:00 AM" from "09:00". */
export function ampm(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Every individual batch a slot applies to: "26BT10,26BT11" → both; "Other[25A11,25A12]" → the listed ones. */
export function slotBatches(batch?: string): string[] {
  if (!batch) return [];
  const bucket = batch.match(/^([^[]+)\[(.*)\]$/);
  const inner = bucket ? bucket[2] : batch;
  return inner.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Short batch label for a cell: bucket name for pools, the list otherwise. */
export function batchCellLabel(batch?: string): string {
  if (!batch) return "";
  const bucket = batch.match(/^([^[]+)\[/);
  return bucket ? bucket[1].trim() : batch;
}

export function allSections(data: Dataset): { id: string; group: string; load: number }[] {
  const m = new Map<string, { groups: Set<string>; load: number }>();
  for (const s of data.slots) for (const b of slotBatches(s.batch)) {
    const e = m.get(b) ?? { groups: new Set(), load: 0 };
    e.groups.add(s.semester); e.load++; m.set(b, e);
  }
  // Year groups first in year order, then other programmes; sections alphabetical within a group.
  const rank = (g: string) => { const m = g.match(/^Year\s*(\d)/i); return m ? Number(m[1]) : 50; };
  return [...m].map(([id, e]) => ({ id, group: [...e.groups].join(", "), load: e.load })).sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
}

export function allRooms(data: Dataset): string[] {
  return [...new Set(data.slots.map((s) => s.room))].filter((r) => r && r !== "TBA").sort();
}

export function selectSlots(data: Dataset, spec: ExportSpec): Slot[] {
  if (spec.kind === "faculty") return data.slots.filter((s) => s.facultyIds.includes(spec.id));
  if (spec.kind === "room") return data.slots.filter((s) => s.room === spec.id);
  return data.slots.filter((s) => slotBatches(s.batch).includes(spec.id));
}

function cellText(s: Slot, kind: ExportKind): string {
  const t = TYPE_LETTER[s.type] ?? "L";
  const fac = s.facultyIds.join("+");
  if (kind === "faculty") return `${t}-${s.subjectCode}\n${batchCellLabel(s.batch)}\n(${s.room})`;
  if (kind === "section") return `${t}-${s.subjectCode}\n${fac}\n(${s.room})`;
  return `${t}-${s.subjectCode}\n${batchCellLabel(s.batch)}\n(${fac})`;
}

function headerCells(data: Dataset, spec: ExportSpec, load: number, width: number): Cell[] {
  const cells: Cell[] = Array.from({ length: width }, () => ({ v: null, s: S.header }));
  const put = (i: number, v: string) => { cells[i] = { v, s: S.header }; };
  if (spec.kind === "faculty") {
    const f: Faculty | undefined = data.faculty.find((x) => x.id === spec.id);
    put(0, `Name: ${f && f.name !== f.id ? f.name : "-"}`);
    put(1, `Code: ${spec.id}`);
    put(2, `Deptt: ${f?.department || "-"}`);
    put(3, `Venue: -`);
    put(Math.max(4, width - 3), `Extension: -`);
    put(Math.max(5, width - 2), `Mobile: ${f?.phone || "-"}`);
  } else if (spec.kind === "section") {
    const groups = [...new Set(selectSlots(data, spec).map((s) => s.semester))].join(", ");
    put(0, `Section: ${spec.id}`);
    put(1, `Group: ${groups || "-"}`);
    put(2, `Classes/wk: ${load}`);
  } else {
    const teaching = data.periods.filter((p) => !p.isBreak).length * DAYS.length;
    put(0, `Room: ${spec.id}`);
    put(1, `Used: ${load} of ${teaching}`);
    put(2, `Free: ${teaching - load}`);
  }
  put(width - 1, `Total Load: ${load}`);
  return cells;
}

/** One 9-row block (header, times, six days) for a single faculty / section / room. */
export function buildBlock(data: Dataset, spec: ExportSpec): Row[] {
  const periods = data.periods;
  const slots = selectSlots(data, spec);
  const width = periods.length + 2; // day column + one column per period + end-of-day column
  const lunchPeriod = periods.find((p) => p.start === "12:00")?.number ?? periods.find((p) => p.isBreak)?.number ?? null;
  const at = new Map<string, Slot[]>();
  for (const s of slots) { const k = `${s.day}|${s.period}`; at.set(k, [...(at.get(k) ?? []), s]); }

  const rows: Row[] = [];
  rows.push({ h: 26, cells: headerCells(data, spec, slots.length, width) });
  rows.push({ h: 20, cells: [{ v: null, s: S.time }, ...periods.map((p) => ({ v: ampm(p.start), s: S.time })), { v: ampm(periods[periods.length - 1]?.end ?? "17:00"), s: S.time }] });
  for (const d of DAYS) {
    const cells: Cell[] = [{ v: DAY_UP[d], s: S.day }];
    for (const p of periods) {
      const here = at.get(`${d}|${p.number}`) ?? [];
      if (here.length) cells.push({ v: here.map((s) => cellText(s, spec.kind)).join("\n\n"), s: S.cell });
      else if (d === "Sat" && p.start >= "13:00") cells.push({ v: "--", s: S.filler });
      else if (p.number === lunchPeriod && d !== "Sat") cells.push({ v: "LUNCH", s: S.lunch });
      else cells.push({ v: null, s: S.cell });
    }
    cells.push({ v: "--", s: S.filler });
    rows.push({ h: 46, cells });
  }
  return rows;
}

export function exportTitle(data: Dataset, spec: ExportSpec): string {
  if (spec.id === "all") return spec.kind === "faculty" ? "All faculty" : spec.kind === "section" ? "All sections" : "All rooms";
  if (spec.kind === "faculty") { const f = data.faculty.find((x) => x.id === spec.id); return f && f.name !== f.id ? `${f.name} (${f.id})` : spec.id; }
  return spec.kind === "room" ? `Room ${spec.id}` : `Section ${spec.id}`;
}

export function buildExport(data: Dataset, spec: ExportSpec, versionId: number): { workbook: Workbook; fileName: string } {
  const width = data.periods.length + 2;
  const ids = spec.id !== "all" ? [spec.id]
    : spec.kind === "faculty" ? data.faculty.map((f) => f.id).filter((id) => data.slots.some((s) => s.facultyIds.includes(id))).sort()
    : spec.kind === "section" ? allSections(data).map((s) => s.id)
    : allRooms(data);
  const rows: Row[] = [];
  ids.forEach((id, i) => {
    if (i > 0) rows.push({ cells: Array.from({ length: width }, () => ({ v: "~~~~~~~", s: S.sep })) });
    rows.push(...buildBlock(data, { kind: spec.kind, id }));
  });
  const sheetName = spec.kind === "faculty" ? "Faculty Timetable" : spec.kind === "section" ? "Section Timetable" : "Room Timetable";
  const safe = exportTitle(data, spec).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return {
    workbook: { styles: STYLES, sheets: [{ name: sheetName, cols: [11, ...Array(width - 1).fill(17)], rows, freeze: "B1" }] },
    fileName: `${spec.kind === "faculty" ? "Faculty" : spec.kind === "section" ? "Section" : "Room"}_Timetable_${safe}_v${versionId}.xlsx`,
  };
}
