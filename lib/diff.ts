// Compare a new Dataset with the published one and produce plain-language changes.
import type { Change, Dataset, Faculty, Slot } from "./types";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function describeSlot(s: Slot, fac: Map<string, Faculty>) {
  const who = s.facultyIds.map((id) => fac.get(id)?.name ?? id).join(" & ");
  const name = s.subjectName && s.subjectName.trim() !== s.subjectCode.trim() ? ` ${s.subjectName}` : "";
  return `${s.day} P${s.period} ${s.subjectCode}${name} (${s.semester}${s.section ? " " + s.section : ""}${s.batch ? ", " + s.batch : ""})${who ? " — " + who : ""}`;
}

/** Natural identity of a class independent of where it sits in the week: used to detect "moved". */
function classIdentity(s: Slot) {
  return [s.semester, s.section || "-", s.subjectCode, s.type, s.batch || "-", [...s.facultyIds].sort().join("+")].join("|");
}

export function diffDatasets(oldData: Dataset | null, newData: Dataset): Change[] {
  const changes: Change[] = [];
  const fac = new Map<string, Faculty>();
  for (const f of [...(oldData?.faculty ?? []), ...newData.faculty]) fac.set(f.id, f);
  let n = 0;
  const push = (c: Omit<Change, "id">) => changes.push({ id: `c${++n}`, ...c });

  if (!oldData) {
    // First publish of the semester: everyone sees "timetable published", no per-slot noise.
    return changes;
  }

  // Period grid changes affect everyone.
  const oldP = new Map(oldData.periods.map((p) => [p.number, p]));
  for (const p of newData.periods) {
    const o = oldP.get(p.number);
    if (o && (o.start !== p.start || o.end !== p.end)) {
      push({ type: "grid_changed", affectedFacultyIds: newData.faculty.map((f) => f.id), text: `Period ${p.number} now runs ${p.start}–${p.end} (was ${o.start}–${o.end}). All classes in that period move with it.` });
    }
  }

  const oldByKey = new Map(oldData.slots.map((s) => [s.key, s]));
  const newByKey = new Map(newData.slots.map((s) => [s.key, s]));

  const removed: Slot[] = [];
  const added: Slot[] = [];

  for (const [key, o] of oldByKey) {
    const nw = newByKey.get(key);
    if (!nw) { removed.push(o); continue; }

    const facChanged = !sameList(o.facultyIds, nw.facultyIds);
    const roomChanged = o.room !== nw.room;
    const detailsChanged = o.subjectName !== nw.subjectName || (o.notes ?? "") !== (nw.notes ?? "") || (o.start ?? "") !== (nw.start ?? "") || (o.end ?? "") !== (nw.end ?? "");

    if (facChanged) {
      const oldWho = o.facultyIds.map((id) => fac.get(id)?.name ?? id).join(" & ");
      const newWho = nw.facultyIds.map((id) => fac.get(id)?.name ?? id).join(" & ");
      push({ type: "reassigned", before: o, after: nw, affectedFacultyIds: uniq([...o.facultyIds, ...nw.facultyIds]), text: `${describeSlot(nw, fac).replace(/ — .*$/, "")} is reassigned from ${oldWho} to ${newWho}${roomChanged ? `, room ${o.room} → ${nw.room}` : ""}.` });
      continue;
    }
    if (roomChanged) {
      push({ type: "room_changed", before: o, after: nw, affectedFacultyIds: nw.facultyIds, text: `${describeSlot(nw, fac)} moves from ${o.room} to ${nw.room}.` });
    }
    if (detailsChanged) {
      const bits: string[] = [];
      const nameOnly = o.subjectName !== nw.subjectName && (o.notes ?? "") === (nw.notes ?? "") && (o.start ?? "") === (nw.start ?? "") && (o.end ?? "") === (nw.end ?? "");
      if (o.subjectName !== nw.subjectName) bits.push(`course name "${o.subjectName}" → "${nw.subjectName}"`);
      if ((o.notes ?? "") !== (nw.notes ?? "")) bits.push(nw.notes ? `note: "${nw.notes}"` : "note removed");
      if ((o.start ?? "") !== (nw.start ?? "") || (o.end ?? "") !== (nw.end ?? "")) bits.push(`time ${nw.start}–${nw.end}`);
      // A course-name correction is cosmetic: recorded for the office, but it alerts nobody.
      push({ type: "details_changed", before: o, after: nw, affectedFacultyIds: nameOnly ? [] : nw.facultyIds, text: `${describeSlot(nw, fac)}: ${bits.join("; ")}.` });
    }
  }
  for (const [key, nw] of newByKey) if (!oldByKey.has(key)) added.push(nw);

  // Pair removed/added with the same class identity → "moved".
  const addedByIdentity = new Map<string, Slot[]>();
  for (const a of added) {
    const id = classIdentity(a);
    addedByIdentity.set(id, [...(addedByIdentity.get(id) ?? []), a]);
  }
  const consumedAdded = new Set<Slot>();
  for (const r of removed) {
    const cands = addedByIdentity.get(classIdentity(r))?.filter((a) => !consumedAdded.has(a));
    if (cands && cands.length) {
      const a = cands[0];
      consumedAdded.add(a);
      push({ type: "moved", before: r, after: a, affectedFacultyIds: a.facultyIds, text: `${a.subjectCode}${a.subjectName && a.subjectName.trim() !== a.subjectCode.trim() ? " " + a.subjectName : ""} (${a.semester}${a.section ? " " + a.section : ""}${a.batch ? ", " + a.batch : ""}) moves from ${r.day} P${r.period} ${r.room} to ${a.day} P${a.period} ${a.room}.` });
    } else {
      push({ type: "removed", before: r, affectedFacultyIds: r.facultyIds, text: `${describeSlot(r, fac)} in ${r.room} is removed.` });
    }
  }
  for (const a of added) if (!consumedAdded.has(a)) push({ type: "added", after: a, affectedFacultyIds: a.facultyIds, text: `New class: ${describeSlot(a, fac)} in ${a.room}.` });

  // Faculty sheet changes (admin-visible, alert the person whose record changed).
  const oldF = new Map(oldData.faculty.map((f) => [f.id, f]));
  for (const f of newData.faculty) {
    const o = oldF.get(f.id);
    if (o && o.email !== f.email) push({ type: "details_changed", affectedFacultyIds: [f.id], text: `Email for ${f.name} updated to ${f.email}.` });
  }

  const order: Record<Change["type"], number> = { grid_changed: 0, reassigned: 1, moved: 2, room_changed: 3, added: 4, removed: 5, details_changed: 6 };
  changes.sort((a, b) => order[a.type] - order[b.type]);
  return changes;
}

export function changesByFaculty(changes: Change[]): Map<string, Change[]> {
  const m = new Map<string, Change[]>();
  for (const c of changes) for (const id of c.affectedFacultyIds) m.set(id, [...(m.get(id) ?? []), c]);
  return m;
}

export function summarize(data: Dataset, changes: Change[]) {
  return { slots: data.slots.length, faculty: data.faculty.length, changes: changes.length, affectedFaculty: changesByFaculty(changes).size };
}

function uniq<T>(xs: T[]) { return [...new Set(xs)]; }

/** Keep only the slot fields any reader uses (alerts, reminders, admin grouping). */
export function slimForStorage(changes: Change[]): Change[] {
  const pick = (s?: Slot) => s ? ({ key: s.key, day: s.day, period: s.period, semester: s.semester, section: s.section, subjectCode: s.subjectCode, room: s.room, batch: s.batch } as Slot) : undefined;
  return changes.map((c) => ({ ...c, before: pick(c.before), after: pick(c.after) }));
}
