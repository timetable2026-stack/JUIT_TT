// Public: the published timetable, recent change lists, announcements and acks.
import { getPublicPayload } from "@/lib/publicPayload";
import { spaceOf } from "@/lib/space";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const payload = await getPublicPayload(spaceOf(req));
  // Short shared cache: a publish shows up within a minute, and a department refreshing at 9:00 hits the cache.
  return Response.json(payload, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
