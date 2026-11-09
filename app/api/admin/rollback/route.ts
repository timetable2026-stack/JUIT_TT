// Admin: republish an earlier version. It becomes a new version with its own diff and alerts.
import { requireAdmin } from "@/lib/auth";
import { publishDataset } from "@/lib/publish";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const target = await getStore().getVersion(Number(body.versionId));
  if (!target) return Response.json({ error: "Version not found" }, { status: 404 });
  const result = await publishDataset({ data: target.data, note: body.note ? String(body.note).slice(0, 500) : `Rolled back to version ${target.id}`, fileName: target.fileName, issues: target.issues, sendEmail: body.sendEmail !== false });
  return Response.json({ ok: true, versionId: result.version.id, summary: result.version.summary, emails: result.emails });
}

export const POST = (req: Request) => withErrors(() => handlePOST(req));

/** Turn any unexpected failure into a readable message instead of a bare 500. */
async function withErrors(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); }
  catch (e: any) {
    const msg = String(e?.message ?? e);
    const hint = /EROFS|read-only|ENOENT|EACCES/i.test(msg)
      ? " The server could not write its data file. Connect the database (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables) and redeploy."
      : /relation .* does not exist|schema cache/i.test(msg)
      ? " The database tables are missing: run supabase/schema.sql in the Supabase SQL editor."
      : "";
    console.error(msg);
    return Response.json({ error: `Something went wrong: ${msg}.${hint}` }, { status: 500 });
  }
}
