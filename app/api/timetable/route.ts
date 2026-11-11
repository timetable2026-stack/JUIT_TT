// Public: the published timetable, recent change lists, announcements and acks.
import { getPublicPayload } from "@/lib/publicPayload";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getPublicPayload();
  // Short shared cache: a publish shows up within a minute, and a department refreshing at 9:00 hits the cache.
  return Response.json(payload, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
