// Admin (and anyone with the link): download the blank template, or the current
// published timetable as a workbook in the same layout (for editing and re-upload).
import { templateSheets } from "@/lib/excel";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const XLSX = await import("xlsx");
  const which = new URL(req.url).searchParams.get("which") ?? "template";
  const wb = XLSX.utils.book_new();
  let name = "Timetable_Template.xlsx";
  if (which === "current") {
    const live = await getStore().getPublished();
    if (!live) return new Response("Nothing published yet", { status: 404 });
    const d = live.data;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Semester", "Section", "Day", "Period", "Start", "End", "Subject code", "Subject name", "Type", "Faculty ID", "Room", "Batch", "Notes"], ...d.slots.map((s) => [s.semester, s.section, s.day, s.period, s.start ?? "", s.end ?? "", s.subjectCode, s.subjectName, s.type, s.facultyIds.join(";"), s.room, s.batch ?? "", s.notes ?? ""])]), "Timetable");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Faculty ID", "Full name", "Email", "Department", "Designation", "Phone", "Role"], ...d.faculty.map((f) => [f.id, f.name, f.email, f.department ?? "", f.designation ?? "", f.phone ?? "", f.role])]), "Faculty");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Period", "Start", "End", "Break", "Label"], ...d.periods.map((p) => [p.number, p.start, p.end, p.isBreak ? "Yes" : "", p.label ?? ""])]), "Periods");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Semester", "Start date", "End date", "Academic year", "Exam window"], ...d.semesters.map((s) => [s.name, s.startDate, s.endDate, s.academicYear ?? "", s.examWindow ?? ""])]), "Semesters");
    name = `Timetable_v${live.id}.xlsx`;
  } else {
    for (const [sheet, rows] of Object.entries(templateSheets())) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  }
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"` } });
}
