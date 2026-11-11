// Admin: load and utilisation statistics of the published timetable; ?format=xlsx downloads them.
import { requireAdmin } from "@/lib/auth";
import { computeStats, statsToSheets } from "@/lib/stats";
import { getStore } from "@/lib/store";
import { STYLES } from "@/lib/exportGrid";
import { writeXlsx } from "@/lib/xlsxWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const live = await getStore().getPublished();
  if (!live) return Response.json({ error: "Nothing published yet" }, { status: 404 });
  const stats = computeStats(live.data, live.id, live.publishedAt);
  if (new URL(req.url).searchParams.get("format") !== "xlsx") return Response.json(stats, { headers: { "Cache-Control": "private, max-age=60" } });
  const JSZip = (await import("jszip")).default;
  const sheets = statsToSheets(stats).map((s) => ({
    name: s.name, cols: s.rows[0]?.map((_, i) => (i === 0 ? 34 : 14)) ?? [], freeze: "A2",
    rows: s.rows.map((r, ri) => ({ cells: r.map((v) => ({ v, s: ri === 0 ? 1 : 0 })) })),
  }));
  const bytes = await writeXlsx({ styles: STYLES, sheets }, JSZip);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Timetable_Statistics_v${live.id}.xlsx"`, "Cache-Control": "private, no-store" } });
}
