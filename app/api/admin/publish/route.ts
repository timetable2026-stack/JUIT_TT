// Admin: publish a draft (alerts + emails go out here).
import { requireAdmin } from "@/lib/auth";
import { publishDataset } from "@/lib/publish";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const draftId = Number(body.draftId);
  const draft = draftId ? await getStore().getVersion(draftId) : null;
  if (!draft || draft.status !== "draft") return Response.json({ error: "Draft not found (upload the file again)." }, { status: 404 });
  const result = await publishDataset({ data: draft.data, note: body.note ? String(body.note).slice(0, 500) : undefined, fileName: draft.fileName, issues: draft.issues, existingDraftId: draft.id, sendEmail: body.sendEmail !== false });
  return Response.json({ ok: true, versionId: result.version.id, summary: result.version.summary, emails: result.emails });
}
