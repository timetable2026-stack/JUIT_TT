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
    ? `Today: ${first.subjectCode} at ${first.start} in ${first.room}`
    : `Today: ${slots.length} classes, first at ${first.start} in ${first.room}`;

  const rows = slots.map((s) => {
    const name = s.subjectName && s.subjectName.trim() !== s.subjectCode.trim() ? s.subjectName : "";
    const co = s.facultyIds.filter((id) => id !== o.faculty.id).map((id) => o.data.faculty.find((f) => f.id === id)?.name ?? id);
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7ec;white-space:nowrap;font-weight:bold;color:#1f3a5f;vertical-align:top">${s.start}<div style="font-weight:normal;color:#6b7684;font-size:12px">P${s.period} · to ${s.end}</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7ec;vertical-align:top">
        <b>${esc(s.subjectCode)}</b>${name ? " " + esc(name) : ""}
        <div style="color:#5b6573;font-size:12.5px">${esc(s.semester)}${s.batch ? " · " + esc(shortBatch(s.batch)) : ""} · ${esc(s.type)}${co.length ? " · with " + esc(co.join(", ")) : ""}</div>
        ${s.notes ? `<div style="color:#9a6700;font-size:12.5px">${esc(s.notes)}</div>` : ""}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7ec;white-space:nowrap;vertical-align:top"><span style="background:#eef2f7;border-radius:6px;padding:5px 9px;font-weight:bold">${esc(s.room)}</span></td>
    </tr>`;
  }).join("");

  const notices = (o.announcements ?? []).map((a) =>
    `<div style="background:#e8f0fb;border-left:4px solid #1f3a5f;padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0"><b>${esc(a.title)}</b><div style="font-size:13px;white-space:pre-wrap;margin-top:2px">${esc(a.body)}</div></div>`).join("");
  const changed = (o.recentChanges ?? []).length
    ? `<div style="background:#fff6d6;border-left:4px solid #f0b429;padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0"><b>Changed since yesterday</b><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">${o.recentChanges!.map((t) => `<li style="margin:3px 0">${esc(t)}</li>`).join("")}</ul></div>`
    : "";

  const body = `
    <h2 style="margin:0 0 2px;font-size:20px">Good morning, ${esc(firstName(o.faculty.name))}</h2>
    <p style="color:#5b6573;margin:0 0 14px">${esc(o.dateLabel)} — ${slots.length} class${slots.length === 1 ? "" : "es"} today</p>
    ${changed}${notices}
    <table role="presentation" style="border-collapse:collapse;width:100%;border:1px solid #e3e7ec;border-radius:8px">${rows}</table>
    <p style="margin:18px 0 6px"><a href="${link}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold">Open my timetable</a></p>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f9;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1d21">
    <tr><td style="background:#1f3a5f;color:#fff;padding:14px 24px"><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.85">${esc(o.department)}</div><div style="font-size:16px;font-weight:bold;margin-top:2px">Today's classes</div></td></tr>
    <tr><td style="padding:22px 24px">${body}</td></tr>
    <tr><td style="padding:12px 24px;border-top:1px solid #e3e7ec;font-size:12px;color:#6b7684;line-height:1.5">Daily reminder from the Time Table Committee. <a href="${link}&reminders=1" style="color:#1f3a5f">Turn this off</a> · <a href="${icsLink(o.siteUrl, o.faculty.id)}" style="color:#1f3a5f">Calendar subscription</a></td></tr>
  </table></td></tr></table></body></html>`;

  const text = `Good morning, ${firstName(o.faculty.name)}\n${o.dateLabel} — ${slots.length} class(es) today\n\n`
    + slots.map((s) => `${s.start}-${s.end}  P${s.period}  ${s.subjectCode}  ${s.semester}${s.batch ? " " + shortBatch(s.batch) : ""}  ${s.room}  (${s.type})${s.notes ? "  [" + s.notes + "]" : ""}`).join("\n")
    + (o.recentChanges?.length ? `\n\nChanged since yesterday:\n${o.recentChanges.map((t) => "- " + t).join("\n")}` : "")
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
