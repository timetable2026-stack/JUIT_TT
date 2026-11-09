// Admin: see exactly who today's reminder would reach, preview one message,
// send the run by hand, and change the reminder settings.
import { requireAdmin } from "@/lib/auth";
import { planDailyReminders, sendDailyReminders } from "@/lib/runReminders";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleGET(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const url = new URL(req.url);
  const when = url.searchParams.get("date");
  const at = when ? new Date(`${when}T06:00:00+05:30`) : new Date();
  const plan = await planDailyReminders(at);
  const previewFor = url.searchParams.get("preview");
  const pick = previewFor ? plan.recipients.find((r) => r.faculty.id === previewFor) : plan.recipients[0];
  return Response.json({
    date: plan.date, day: plan.day, label: plan.label, skip: plan.skip,
    counts: { willEmail: plan.recipients.length, noClasses: plan.noClasses, optedOut: plan.optedOut, noEmail: plan.noEmail },
    recipients: plan.recipients.map((r) => ({ id: r.faculty.id, name: r.faculty.name, email: r.faculty.email, classes: r.classes, subject: r.content.subject })),
    preview: pick ? { id: pick.faculty.id, name: pick.faculty.name, subject: pick.content.subject, html: pick.content.html } : null,
  });
}

async function handlePOST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body.action === "send") {
    const r = await sendDailyReminders();
    return Response.json({ ok: true, skip: r.skip, planned: r.recipients.length, sent: r.sent, failed: r.failed, skipped: r.skipped });
  }
  if (body.action === "settings") {
    const patch: Record<string, unknown> = {};
    if (typeof body.reminderEnabled === "boolean") patch.reminderEnabled = body.reminderEnabled;
    if (Number.isInteger(body.reminderHour)) patch.reminderHour = Math.min(23, Math.max(0, body.reminderHour));
    if (Array.isArray(body.reminderDays)) patch.reminderDays = body.reminderDays.map(String);
    if (Array.isArray(body.holidays)) patch.holidays = [...new Set(body.holidays.map(String))].sort();
    if (typeof body.remindOnlyWithClasses === "boolean") patch.remindOnlyWithClasses = body.remindOnlyWithClasses;
    return Response.json({ ok: true, settings: await getStore().saveSettings(patch) });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = (req: Request) => withErrors(() => handleGET(req));
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
