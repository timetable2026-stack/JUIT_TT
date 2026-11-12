// Workload and utilisation statistics computed from the published timetable.
// Conventions: load = periods per week; a two-period lab counts 2; a class with
// two faculty counts for each of them; TBA/placeholder codes are excluded.
import { allRooms, allSections, slotBatches } from "./exportGrid";
import { DAYS, type Dataset, type Faculty, type Slot } from "./types";

const PLACEHOLDER = new Set(["TBA", "TBD", "NA", "N/A", "-", "XXX", "STAFF"]);

export interface FacultyLoad {
  id: string; name: string; dept: string;
  load: number; lectures: number; labs: number; tutorials: number; other: number;
  days: number; maxPerDay: number; busiestDay: string; longestRun: number;
  saturday: number; firstPeriod: number | null; lastPeriod: number | null; courses: number; sections: number;
  vsAvg: number; // percentage above (+) or below (−) the university average
}
export interface DeptLoad {
  dept: string; faculty: number; teaching: number; periods: number; avg: number; median: number; min: number; max: number;
  lectures: number; labs: number; tutorials: number; zeroLoad: number; share: number; // share of all periods, %
}
export interface RoomUse { room: string; used: number; capacity: number; pct: number; kind: "Classroom" | "Lab" | "Other"; busiestDay: string }
export type Heatmap = { day: string; periods: { period: number; classes: number }[] }[];

export interface Stats {
  generatedFor: { versionId: number; publishedAt?: string };
  overall: {
    classes: number; periodsTaught: number; faculty: number; teachingFaculty: number; departments: number; sections: number; rooms: number;
    avgLoad: number; medianLoad: number; minLoad: number; maxLoad: number; stdDev: number;
    lectures: number; labs: number; tutorials: number; other: number;
    roomUtilisation: number; unassigned: number; multiFaculty: number; electiveSlots: number;
    avgSectionPeriods: number;
  };
  distribution: { bucket: string; count: number }[];
  departments: DeptLoad[];
  faculty: FacultyLoad[];
  heatmap: Heatmap;
  /** The same day × period grid for each year group, keyed by group name (e.g. "Year 2"). */
  heatmapByGroup: { group: string; heatmap: Heatmap; classes: number; faculty: number }[];
  rooms: RoomUse[];
  groups: { group: string; classes: number; sections: number; avgPeriodsPerSection: number; faculty: number }[];
  flags: { kind: string; who: string; detail: string }[];
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

function roomKind(room: string): RoomUse["kind"] {
  if (/^(CL|LAB|L\d|PL|DLC|CC)/i.test(room) || /lab/i.test(room)) return "Lab";
  if (/^(CR|LT|LH|TR|CH|AUD|SR|AV)/i.test(room)) return "Classroom";
  return "Other";
}

export function computeStats(data: Dataset, versionId: number, publishedAt?: string): Stats {
  const slots = data.slots;
  const facById = new Map(data.faculty.map((f) => [f.id, f]));
  const byFac = new Map<string, Slot[]>();
  for (const s of slots) for (const id of s.facultyIds) {
    if (PLACEHOLDER.has(id.toUpperCase())) continue;
    byFac.set(id, [...(byFac.get(id) ?? []), s]);
  }
  const teachingIds = new Set(byFac.keys());
  const allIds = new Set<string>([...data.faculty.map((f) => f.id), ...teachingIds]);

  // ---- per faculty
  const faculty: FacultyLoad[] = [];
  for (const id of allIds) {
    if (PLACEHOLDER.has(id.toUpperCase())) continue;
    const f: Faculty | undefined = facById.get(id);
    const mine = byFac.get(id) ?? [];
    const perDay = new Map<string, number[]>();
    for (const s of mine) perDay.set(s.day, [...(perDay.get(s.day) ?? []), s.period]);
    let maxPerDay = 0, busiestDay = "—", longestRun = 0;
    for (const [d, ps] of perDay) {
      if (ps.length > maxPerDay) { maxPerDay = ps.length; busiestDay = d; }
      const sorted = [...new Set(ps)].sort((a, b) => a - b);
      let run = 1; for (let i = 1; i < sorted.length; i++) { run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1; longestRun = Math.max(longestRun, run); }
      longestRun = Math.max(longestRun, sorted.length ? 1 : 0);
    }
    const periods = mine.map((s) => s.period);
    faculty.push({
      id, name: f?.name && f.name !== id ? f.name : id, dept: f?.department || "—",
      load: mine.length,
      lectures: mine.filter((s) => s.type === "Lecture").length, labs: mine.filter((s) => s.type === "Lab").length,
      tutorials: mine.filter((s) => s.type === "Tutorial").length, other: mine.filter((s) => !["Lecture", "Lab", "Tutorial"].includes(s.type)).length,
      days: perDay.size, maxPerDay, busiestDay, longestRun, saturday: perDay.get("Sat")?.length ?? 0,
      firstPeriod: periods.length ? Math.min(...periods) : null, lastPeriod: periods.length ? Math.max(...periods) : null,
      courses: new Set(mine.map((s) => s.subjectCode)).size, sections: new Set(mine.flatMap((s) => slotBatches(s.batch))).size,
      vsAvg: 0,
    });
  }
  const loads = faculty.filter((f) => f.load > 0).map((f) => f.load);
  const avgLoad = mean(loads);
  for (const f of faculty) f.vsAvg = avgLoad ? Math.round(((f.load - avgLoad) / avgLoad) * 100) : 0;
  faculty.sort((a, b) => b.load - a.load || a.name.localeCompare(b.name));
  const stdDev = Math.sqrt(mean(loads.map((x) => (x - avgLoad) ** 2)));

  // ---- per department
  const deptMap = new Map<string, FacultyLoad[]>();
  for (const f of faculty) deptMap.set(f.dept, [...(deptMap.get(f.dept) ?? []), f]);
  const totalPeriods = faculty.reduce((a, f) => a + f.load, 0);
  const departments: DeptLoad[] = [...deptMap].map(([dept, fs]) => {
    const teaching = fs.filter((f) => f.load > 0); const ls = teaching.map((f) => f.load);
    return {
      dept, faculty: fs.length, teaching: teaching.length, periods: ls.reduce((a, b) => a + b, 0),
      avg: r1(mean(ls)), median: median(ls), min: ls.length ? Math.min(...ls) : 0, max: ls.length ? Math.max(...ls) : 0,
      lectures: fs.reduce((a, f) => a + f.lectures, 0), labs: fs.reduce((a, f) => a + f.labs, 0), tutorials: fs.reduce((a, f) => a + f.tutorials, 0),
      zeroLoad: fs.length - teaching.length, share: totalPeriods ? r1((ls.reduce((a, b) => a + b, 0) / totalPeriods) * 100) : 0,
    };
  }).sort((a, b) => b.periods - a.periods);

  // ---- distribution
  const buckets: [string, (n: number) => boolean][] = [["0", (n) => n === 0], ["1–5", (n) => n >= 1 && n <= 5], ["6–10", (n) => n >= 6 && n <= 10], ["11–15", (n) => n >= 11 && n <= 15], ["16–20", (n) => n >= 16 && n <= 20], ["21+", (n) => n >= 21]];
  const distribution = buckets.map(([bucket, test]) => ({ bucket, count: faculty.filter((f) => test(f.load)).length }));

  // ---- heatmap day × period (distinct classes), overall and per year group
  const heatOf = (ss: Slot[]): Heatmap => DAYS.map((day) => ({ day, periods: data.periods.map((p) => ({ period: p.number, classes: ss.filter((s) => s.day === day && s.period === p.number).length })) }));
  const heatmap = heatOf(slots);
  const heatmapByGroup = data.semesters.map((sem) => { const gs = slots.filter((s) => s.semester === sem.name); return { group: sem.name, heatmap: heatOf(gs), classes: gs.length, faculty: new Set(gs.flatMap((s) => s.facultyIds)).size }; });

  // ---- rooms
  const teachingPeriods = data.periods.filter((p) => !p.isBreak).length;
  const capacity = teachingPeriods * DAYS.length;
  const rooms: RoomUse[] = allRooms(data).map((room) => {
    const rs = slots.filter((s) => s.room === room);
    const used = new Set(rs.map((s) => `${s.day}|${s.period}`)).size;
    const byDay = new Map<string, number>(); for (const s of rs) byDay.set(s.day, (byDay.get(s.day) ?? 0) + 1);
    const busiestDay = [...byDay].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { room, used, capacity, pct: capacity ? Math.round((used / capacity) * 100) : 0, kind: roomKind(room), busiestDay };
  }).sort((a, b) => b.pct - a.pct);

  // ---- year groups
  const sections = allSections(data);
  const groups = data.semesters.map((sem) => {
    const gs = slots.filter((s) => s.semester === sem.name);
    const secs = sections.filter((x) => x.group.split(", ").includes(sem.name));
    return { group: sem.name, classes: gs.length, sections: secs.length, avgPeriodsPerSection: r1(mean(secs.map((x) => x.load))), faculty: new Set(gs.flatMap((s) => s.facultyIds)).size };
  });

  // ---- flags worth a look
  const flags: Stats["flags"] = [];
  for (const f of faculty) {
    if (f.maxPerDay >= 6) flags.push({ kind: "Heavy day", who: `${f.name} (${f.id})`, detail: `${f.maxPerDay} periods on ${f.busiestDay}` });
    if (f.longestRun >= 5) flags.push({ kind: "Long run", who: `${f.name} (${f.id})`, detail: `${f.longestRun} consecutive periods` });
    if (f.load > 0 && f.vsAvg >= 50) flags.push({ kind: "High load", who: `${f.name} (${f.id})`, detail: `${f.load}/wk, ${f.vsAvg}% above average` });
    if (f.load > 0 && f.vsAvg <= -50) flags.push({ kind: "Light load", who: `${f.name} (${f.id})`, detail: `${f.load}/wk, ${-f.vsAvg}% below average` });
    if (f.load === 0 && facById.has(f.id)) flags.push({ kind: "No classes", who: `${f.name} (${f.id})`, detail: "listed in Faculty sheet, nothing scheduled" });
  }
  const unassigned = slots.filter((s) => s.facultyIds.every((id) => PLACEHOLDER.has(id.toUpperCase()))).length;
  if (unassigned) flags.push({ kind: "Unassigned", who: "TBA", detail: `${unassigned} class periods have no faculty yet` });
  const noRoom = slots.filter((s) => !s.room || s.room === "TBA").length;
  if (noRoom) flags.push({ kind: "No room", who: "—", detail: `${noRoom} class periods have no room` });

  const overall = {
    classes: slots.length, periodsTaught: totalPeriods, faculty: faculty.length, teachingFaculty: loads.length, departments: departments.length,
    sections: sections.length, rooms: rooms.length,
    avgLoad: r1(avgLoad), medianLoad: median(loads), minLoad: loads.length ? Math.min(...loads) : 0, maxLoad: loads.length ? Math.max(...loads) : 0, stdDev: r1(stdDev),
    lectures: slots.filter((s) => s.type === "Lecture").length, labs: slots.filter((s) => s.type === "Lab").length, tutorials: slots.filter((s) => s.type === "Tutorial").length,
    other: slots.filter((s) => !["Lecture", "Lab", "Tutorial"].includes(s.type)).length,
    roomUtilisation: rooms.length ? Math.round(mean(rooms.map((r) => r.pct))) : 0, unassigned,
    multiFaculty: slots.filter((s) => s.facultyIds.length > 1).length,
    electiveSlots: slots.filter((s) => /\[/.test(s.batch ?? "")).length,
    avgSectionPeriods: r1(mean(sections.map((x) => x.load))),
  };
  return { generatedFor: { versionId, publishedAt }, overall, distribution, departments, faculty, heatmap, heatmapByGroup, rooms, groups, flags };
}

/** Sheets for the Excel export of the statistics (arrays of arrays). */
export function statsToSheets(st: Stats): { name: string; rows: (string | number)[][] }[] {
  const o = st.overall;
  return [
    { name: "Overview", rows: [
      ["JUIT Timetable — load & utilisation statistics", ""], [`Timetable version ${st.generatedFor.versionId}`, st.generatedFor.publishedAt ?? ""], [],
      ["Classes per week", o.classes], ["Faculty periods per week (co-teaching counted per person)", o.periodsTaught], ["Faculty listed", o.faculty], ["Faculty with classes", o.teachingFaculty], ["Departments", o.departments],
      ["Average load (periods/week)", o.avgLoad], ["Median load", o.medianLoad], ["Lowest / highest load", `${o.minLoad} / ${o.maxLoad}`], ["Standard deviation", o.stdDev],
      ["Lectures", o.lectures], ["Labs", o.labs], ["Tutorials", o.tutorials], ["Other", o.other],
      ["Sections", o.sections], ["Average periods per section", o.avgSectionPeriods], ["Rooms in use", o.rooms], ["Average room utilisation %", o.roomUtilisation],
      ["Co-taught class periods", o.multiFaculty], ["Elective-pool class periods", o.electiveSlots], ["Unassigned (TBA) class periods", o.unassigned],
    ] },
    { name: "Departments", rows: [["Department", "Faculty", "Teaching", "Periods/wk", "Average", "Median", "Min", "Max", "Lectures", "Labs", "Tutorials", "No classes", "Share %"], ...st.departments.map((d) => [d.dept, d.faculty, d.teaching, d.periods, d.avg, d.median, d.min, d.max, d.lectures, d.labs, d.tutorials, d.zeroLoad, d.share])] },
    { name: "Faculty", rows: [["Code", "Name", "Department", "Load/wk", "Lectures", "Labs", "Tutorials", "Other", "Days", "Max in a day", "Busiest day", "Longest run", "Saturday", "Courses", "Sections", "vs average %"], ...st.faculty.map((f) => [f.id, f.name, f.dept, f.load, f.lectures, f.labs, f.tutorials, f.other, f.days, f.maxPerDay, f.busiestDay, f.longestRun, f.saturday, f.courses, f.sections, f.vsAvg])] },
    { name: "Rooms", rows: [["Room", "Type", "Used", "Capacity", "Utilisation %", "Busiest day"], ...st.rooms.map((r) => [r.room, r.kind, r.used, r.capacity, r.pct, r.busiestDay])] },
    { name: "Day x Period", rows: [["All years"], ["Day", ...st.heatmap[0].periods.map((p) => `P${p.period}`)], ...st.heatmap.map((h) => [h.day, ...h.periods.map((p) => p.classes)]),
      ...st.heatmapByGroup.flatMap((g) => [[], [g.group], ["Day", ...g.heatmap[0].periods.map((p) => `P${p.period}`)], ...g.heatmap.map((h) => [h.day, ...h.periods.map((p) => p.classes)])])] },
    { name: "Year groups", rows: [["Group", "Classes/wk", "Sections", "Avg periods per section", "Faculty involved"], ...st.groups.map((g) => [g.group, g.classes, g.sections, g.avgPeriodsPerSection, g.faculty])] },
    { name: "Flags", rows: [["Kind", "Who", "Detail"], ...st.flags.map((f) => [f.kind, f.who, f.detail])] },
  ];
}
