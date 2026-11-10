// Public: download a faculty member's, section's or room's week — or every one of
// them stacked — in the office's "Faculty Timetable" layout.
// e.g. /api/export?kind=faculty&id=AKA   /api/export?kind=section&id=26BT27   /api/export?kind=room&id=all
import { isAdmin } from "@/lib/auth";
import { allRooms, allSections, buildExport, type ExportKind } from "@/lib/exportGrid";
import { getStore } from "@/lib/store";
import { writeXlsx } from "@/lib/xlsxWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "faculty") as ExportKind;
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!["faculty", "section", "room"].includes(kind) || !id) return new Response("kind and id are required", { status: 400 });
  const live = await getStore().getPublished();
  if (!live) return new Response("No timetable published", { status: 404 });
  if (id !== "all") {
    const known = kind === "faculty" ? live.data.faculty.some((f) => f.id === id) : kind === "room" ? allRooms(live.data).includes(id) : allSections(live.data).some((s) => s.id === id);
    if (!known) return new Response(`Unknown ${kind}: ${id}`, { status: 404 });
  }
  // The all-faculty workbook carries phone numbers, so it stays with the office.
  if (kind === "faculty" && id === "all" && !isAdmin(req)) return new Response("Office sign-in required for the all-faculty workbook", { status: 401 });
  const JSZip = (await import("jszip")).default;
  const ex = buildExport(live.data, { kind, id }, live.id);
  const bytes = await writeXlsx(ex.workbook, JSZip);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ex.fileName}"`, "Cache-Control": "no-store" },
  });
}
