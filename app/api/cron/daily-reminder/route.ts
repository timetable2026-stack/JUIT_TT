// Runs every morning from Vercel Cron (see vercel.json). Also callable by hand
// with the same secret, which is how the admin panel's "send now" works.
import { isAdmin } from "@/lib/auth";
import { sendDailyReminders } from "@/lib/runReminders";
import { SPACES } from "@/lib/space";

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
  // One run covers every space (the original site and e.g. /2026); a space whose
  // tables are not set up yet is reported, not fatal.
  const spaces = [];
  for (const space of SPACES) {
    try {
      const result = await sendDailyReminders(new Date(), space);
      spaces.push({ space: space.id || "default", portal: space.portal || "/", date: result.date, day: result.day, skip: result.skip,
        planned: result.recipients.length, sent: result.sent, failed: result.failed, skippedEmails: result.skipped,
        noClasses: result.noClasses, optedOut: result.optedOut, noEmail: result.noEmail });
    } catch (e: any) {
      spaces.push({ space: space.id || "default", portal: space.portal || "/", error: String(e?.message ?? e) });
    }
  }
  const first = spaces[0] as any;
  return Response.json({ ok: true, ...first, spaces });
}

export const GET = run;
export const POST = run;
