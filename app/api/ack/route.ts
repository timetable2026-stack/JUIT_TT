// Public: a faculty member marks a publish as seen.
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const versionId = Number(body.versionId);
  const facultyId = String(body.facultyId ?? "").trim();
  if (!versionId || !facultyId) return Response.json({ error: "versionId and facultyId required" }, { status: 400 });
  await getStore().addAck({ versionId, facultyId, seenAt: new Date().toISOString() });
  return Response.json({ ok: true });
}
