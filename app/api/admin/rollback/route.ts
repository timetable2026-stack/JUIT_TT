// Admin: republish an earlier version. It becomes a new version with its own diff and alerts.
import { requireAdmin } from "@/lib/auth";
import { publishDataset } from "@/lib/publish";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const target = await getStore().getVersion(Number(body.versionId));
  if (!target) return Response.json({ error: "Version not found" }, { status: 404 });
  const result = await publishDataset({ data: target.data, note: body.note ? String(body.note).slice(0, 500) : `Rolled back to version ${target.id}`, fileName: target.fileName, issues: target.issues, sendEmail: body.sendEmail !== false });
  return Response.json({ ok: true, versionId: result.version.id, summary: result.version.summary, emails: result.emails });
}
