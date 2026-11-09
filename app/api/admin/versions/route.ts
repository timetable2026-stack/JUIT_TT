// Admin: full data of one version (for review / download).
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const id = Number(new URL(req.url).searchParams.get("id"));
  const v = await getStore().getVersion(id);
  if (!v) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(v);
}
