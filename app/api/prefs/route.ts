// Public: a faculty member turns their own reminder and change emails on or off.
// No login — the faculty id comes from their personal link, same as the rest of the portal.
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const facultyId = String(body.facultyId ?? "").trim();
  if (!facultyId) return Response.json({ error: "facultyId required" }, { status: 400 });
  const store = getStore();
  const live = await store.getPublished();
  if (!live?.data.faculty.some((f) => f.id === facultyId)) return Response.json({ error: "Unknown faculty id" }, { status: 404 });
  const patch: Record<string, boolean> = {};
  if (typeof body.dailyReminder === "boolean") patch.dailyReminder = body.dailyReminder;
  if (typeof body.changeEmails === "boolean") patch.changeEmails = body.changeEmails;
  await store.setPrefs(facultyId, patch);
  return Response.json({ ok: true, prefs: await store.listPrefs() });
}
