// Shared by the scheduled run and the admin's "send now" / preview buttons.
import { sendBatch, type Recipient } from "./email";
import type { EmailContent } from "./format";
import { dailyReminderEmail, istNow, slotsOnDay, withinTerm } from "./reminders";
import { siteConfig } from "./site";
import { getStore } from "./store";
import type { Faculty } from "./types";

export interface ReminderPlan {
  date: string;
  day: string;
  label: string;
  skip: string | null;                   // why nothing goes out, if so
  recipients: { faculty: Faculty; classes: number; content: EmailContent }[];
  noClasses: number;                     // faculty with nothing on today
  optedOut: number;
  noEmail: number;
}

/** Work out exactly who would be emailed today and what each message says. */
export async function planDailyReminders(at: Date = new Date()): Promise<ReminderPlan> {
  const store = getStore();
  const { date, day, label } = istNow(at);
  const base: ReminderPlan = { date, day, label, skip: null, recipients: [], noClasses: 0, optedOut: 0, noEmail: 0 };

  const [live, settings, prefs, announcements] = await Promise.all([
    store.getPublished(), store.getSettings(), store.listPrefs(), store.listAnnouncements(),
  ]);
  if (!live) return { ...base, skip: "No timetable is published yet." };
  if (!settings.reminderEnabled) return { ...base, skip: "Daily reminders are switched off in Settings." };
  if (!settings.reminderDays.includes(day)) return { ...base, skip: `${day} is not a reminder day.` };
  if (settings.holidays.includes(date)) return { ...base, skip: `${date} is marked as a holiday.` };
  if (!withinTerm(live.data, date)) return { ...base, skip: "Today is outside every semester's teaching dates." };

  const prefBy = new Map(prefs.map((p) => [p.facultyId, p]));
  const now = Date.now();
  const active = announcements.filter((a) => (!a.expiresAt || Date.parse(a.expiresAt) > now) && Date.parse(a.createdAt) > now - 3 * 86400000);
  const site = siteConfig();

  // Changes published in the last day that land on today's classes.
  const since = now - 26 * 3600 * 1000;
  const fresh = Date.parse(live.publishedAt ?? live.createdAt) > since ? live.changes : [];

  const out: ReminderPlan = { ...base };
  for (const f of live.data.faculty) {
    const pref = prefBy.get(f.id);
    if (pref && !pref.dailyReminder) { out.optedOut++; continue; }
    const classes = slotsOnDay(live.data, f.id, day);
    if (classes.length === 0 && settings.remindOnlyWithClasses) { out.noClasses++; continue; }
    if (classes.length === 0) { out.noClasses++; continue; }
    if (!f.email) { out.noEmail++; continue; }
    const mine = fresh.filter((c) => c.affectedFacultyIds.includes(f.id) && (c.after?.day === day || c.before?.day === day)).map((c) => c.text);
    const forThem = active.filter((a) => {
      const aud = a.audience;
      if (aud.kind === "all") return true;
      if (aud.kind === "faculty") return aud.ids.includes(f.id);
      return classes.some((s) => s.semester === aud.semester);
    });
    out.recipients.push({
      faculty: f, classes: classes.length,
      content: dailyReminderEmail({
        data: live.data, faculty: f, day, dateLabel: label, siteUrl: site.url,
        department: site.department, announcements: forThem, recentChanges: mine,
      }),
    });
  }
  return out;
}

/** Send the planned reminders and write the delivery log. */
export async function sendDailyReminders(at: Date = new Date()) {
  const plan = await planDailyReminders(at);
  if (plan.skip || plan.recipients.length === 0) {
    return { ...plan, sent: 0, failed: 0, skipped: 0 };
  }
  const items = plan.recipients.map((r) => ({
    to: { facultyId: r.faculty.id, email: r.faculty.email, name: r.faculty.name } as Recipient,
    content: r.content,
  }));
  const log = await sendBatch("daily", Number(plan.date.replace(/-/g, "")), items);
  await getStore().addEmailLog(log);
  const count = (s: string) => log.filter((l) => l.status === s).length;
  return { ...plan, sent: count("sent"), failed: count("failed"), skipped: count("skipped") };
}
