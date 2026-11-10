// Public: calendar subscription for one faculty member (Google Calendar / Outlook).
import { icsForFaculty } from "@/lib/format";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ facultyId: string }> }) {
  const { facultyId } = await ctx.params;
  const live = await getStore().getPublished();
  if (!live) return new Response("No timetable published", { status: 404 });
  const f = live.data.faculty.find((x) => x.id === decodeURIComponent(facultyId));
  if (!f) return new Response("Unknown faculty id", { status: 404 });
  const ics = icsForFaculty(live.data, f.id, `Timetable — ${f.name}`, live.id);
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="timetable-${f.id}.ics"`, "Cache-Control": "no-store" } });
}
