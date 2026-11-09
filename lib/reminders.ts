// The morning reminder: each faculty member gets one email listing the classes
// they teach that day. Nothing is sent to someone with no classes, and the whole
// run is skipped on a day the office has marked as a holiday.

import type { EmailContent } from "./format";
import { icsLink, personalLink, slotsForFaculty } from "./format";
import type { Announcement, Dataset, Day, Faculty, Slot } from "./types";

export const IST = "Asia/Kolkata";

/** Today's date and weekday in Indian Standard Time, whatever the server's own zone. */
export function istNow(at: Date = new Date()): { date: string; day: Day | "Sun"; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(at) as Day | "Sun";
  const label = new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(at);
  return { date: parts, day: weekday, label };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Classes a faculty member teaches on one weekday, in period order. */
export function slotsOnDay(data: Dataset, facultyId: string, day: string): Slot[] {
  return slotsForFaculty(data, facultyId).filter((s) => s.day === day).sort((a, b) => a.period - b.period);
}

/** Is this date inside any semester's teaching window? */
export function withinTerm(data: Dataset, date: string): boolean {
  return data.semesters.some((s) => date >= s.startDate && date <= s.endDate);
}

export interface ReminderOptions {
  data: Dataset;
  faculty: Faculty;
  day: string;
  dateLabel: string;
  siteUrl: string;
  department: string;
  announcements?: Announcement[];
  /** Changes published since the last reminder that touch this person's day. */
  recentChanges?: string[];
}

export function dailyReminderEmail(o: ReminderOptions): EmailContent {
  const slots = slotsOnDay(o.data, o.faculty.id, o.day);
  const link = personalLink(o.siteUrl, o.faculty.id);
  const first = slots[0];
  const subject = slots.length === 1
    ? `Today: 1 class — ${first.subjectCode} at ${first.start}`
    : `Today: ${slots.length} classes, first at ${first.start} in ${first.room}`;

  const rows = slots.map((s) => {
    const name = s.subjectName && s.subjectName.trim() !== s.subjectCode.trim() ? s.subjectName : "";
    const co = s.facultyIds.filter((id) => id !== o.faculty.id)
      .map((id) => o.data.faculty.find((f) => f.id === id)?.name ?? id);
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7ec;white-space:nowrap;font-weight:bold;color:#1f3a5f">${s.start}<div style="font-weight:normal;color:#6b7684;font-size:12px">P${s.period} · to ${s.end}</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7ec">
        <b>${esc(s.subjectCode)}</b>${name ? " " + esc(name) : ""}
        <div style="color:#5b6573;font-size:12.5px">${esc(s.semester)}${s.batch ? " · " + esc(shortBatch(s.batch)) : ""} · ${esc(s.type)}${co.length ? " · with " + esc(co.join(", ")) : ""}</div>
        ${s.notes ? `<div style="color:#9a6700;font-size:12.5px">${esc(s.notes)}</div>` : ""}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7ec;white-space:nowrap"><span style="background:#eef2f7;border-radius:6px;padding:5px 9px;font-weight:bold">${esc(s.room)}</span></td>
    </tr>`;
  }).join("");

  const notices = (o.announcements ?? []).map((a) =>
    `<p style="background:#e8f0fb;border-left:4px solid #1f3a5f;padding:8px 12px;margin:10px 0"><b>${esc(a.title)}</b><br><span style="font-size:13px;white-space:pre-wrap">${esc(a.body)}</span></p>`).join("");

  const changed = (o.recentChanges ?? []).length
    ? `<p style="background:#fff6d6;border-left:4px solid #f0b429;padding:8px 12px;margin:10px 0"><b>Changed since your last reminder</b></p>
       <ul style="padding-left:18px;font-size:13.5px">${o.recentChanges!.map((t) => `<li style="margin:4px 0">${esc(t)}</li>`).join("")}</ul>`
    : "";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#1a1d21">
    <p style="font-size:13px;color:#6b7684;margin:0 0 4px">${esc(o.department)}</p>
    <h2 style="margin:0 0 2px">Good morning, ${esc(firstName(o.faculty.name))}</h2>
    <p style="color:#5b6573;margin:0 0 14px">${esc(o.dateLabel)} — ${slots.length} class${slots.length === 1 ? "" : "es"} today</p>
    ${changed}
    ${notices}
    <table style="border-collapse:collapse;width:100%;border:1px solid #e3e7ec;border-radius:8px">${rows}</table>
    <p style="margin:16px 0"><a href="${link}" style="display:inline-block;background:#1f3a5f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">Open my timetable</a></p>
    <p style="font-size:12px;color:#6b7684;border-top:1px solid #e3e7ec;padding-top:10px">
      Daily reminder from the department timetable portal.
      <a href="${link}&reminders=1">Turn this off or change the time</a> ·
      <a href="${icsLink(o.siteUrl, o.faculty.id)}">calendar feed</a>
    </p>
  </div>`;

  const text = `Good morning, ${firstName(o.faculty.name)}\n${o.dateLabel} — ${slots.length} class(es) today\n\n`
    + slots.map((s) => `${s.start}-${s.end}  P${s.period}  ${s.subjectCode}  ${s.semester}${s.batch ? " " + shortBatch(s.batch) : ""}  ${s.room}  (${s.type})${s.notes ? "  [" + s.notes + "]" : ""}`).join("\n")
    + (o.recentChanges?.length ? `\n\nChanged since your last reminder:\n${o.recentChanges.map((t) => "- " + t).join("\n")}` : "")
    + `\n\nOpen my timetable: ${link}\nTurn reminders off: ${link}&reminders=1`;

  return { subject, html, text };
}

function firstName(name: string) {
  const cleaned = name.replace(/^(Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "").trim();
  return cleaned.split(/\s+/)[0] || name;
}

/** "Other[25A11,25A12,…]" -> "Other (32 batches)"; long comma lists -> "first +N more". */
export function shortBatch(batch: string): string {
  const bucket = batch.match(/^([^[]+)\[(.*)\]$/);
  if (bucket) {
    const n = bucket[2].split(",").filter(Boolean).length;
    return `${bucket[1].trim()} (${n} batch${n === 1 ? "" : "es"})`;
  }
  const parts = batch.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 3 ? `${parts[0]} +${parts.length - 1} more` : parts.join(", ");
}
