// Runs every morning from Vercel Cron (see vercel.json). Also callable by hand
// with the same secret, which is how the admin panel's "send now" works.
import { isAdmin } from "@/lib/auth";
import { sendDailyReminders } from "@/lib/runReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  if (isAdmin(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function run(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Not authorised" }, { status: 401 });
  const result = await sendDailyReminders();
  return Response.json({
    ok: true, date: result.date, day: result.day, skip: result.skip,
    planned: result.recipients.length, sent: result.sent, failed: result.failed, skippedEmails: result.skipped,
    noClasses: result.noClasses, optedOut: result.optedOut, noEmail: result.noEmail,
  });
}

export const GET = run;
export const POST = run;
