// Public: download one faculty member's, class's or room's week as Excel, in the
// department's own cell convention. e.g. /api/export?kind=faculty&id=RPS
import { buildExport, toWorkbook, type ExportKind } from "@/lib/exportGrid";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "faculty") as ExportKind;
  const id = url.searchParams.get("id") ?? "";
  if (!["faculty", "class", "room"].includes(kind) || !id) return new Response("kind and id are required", { status: 400 });
  const live = await getStore().getPublished();
  if (!live) return new Response("No timetable published", { status: 404 });
  if (kind === "faculty" && !live.data.faculty.some((f) => f.id === id.toUpperCase())) return new Response("Unknown faculty id", { status: 404 });
  const XLSX = await import("xlsx");
  const ex = buildExport(live.data, { kind, id: kind === "faculty" ? id.toUpperCase() : id }, live.id);
  const buf: Buffer = XLSX.write(toWorkbook(XLSX, ex), { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ex.fileName}"`, "Cache-Control": "no-store" },
  });
}
