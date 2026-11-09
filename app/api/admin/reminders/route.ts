// Admin: see exactly who today's reminder would reach, preview one message,
// send the run by hand, and change the reminder settings.
import { requireAdmin } from "@/lib/auth";
import { planDailyReminders, sendDailyReminders } from "@/lib/runReminders";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
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

export async function POST(req: Request) {
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
