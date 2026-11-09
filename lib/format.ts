// Email bodies, personal links and the calendar (ICS) feed. Framework-free.
import { DAYS, type Change, type Dataset, type Faculty, type Slot } from "./types";

export function personalLink(siteUrl: string, facultyId: string) {
  return `${siteUrl.replace(/\/$/, "")}/?f=${encodeURIComponent(facultyId)}`;
}
export function icsLink(siteUrl: string, facultyId: string) {
  return `${siteUrl.replace(/\/$/, "")}/api/ics/${encodeURIComponent(facultyId)}`;
}

export function slotsForFaculty(data: Dataset, facultyId: string): Slot[] {
  return data.slots.filter((s) => s.facultyIds.includes(facultyId)).sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function weekTableHtml(data: Dataset, slots: Slot[]) {
  const periods = data.periods;
  const grid = new Map<string, Slot>();
  for (const s of slots) grid.set(`${s.day}|${s.period}`, s);
  const th = `<th style="padding:6px 8px;border:1px solid #d9dde3;background:#f1f3f6;font-size:12px;text-align:left">`;
  const td = `<td style="padding:6px 8px;border:1px solid #d9dde3;font-size:12px;vertical-align:top">`;
  let html = `<table style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif">`;
  html += `<tr>${th}Period</th>${DAYS.map((d) => `${th}${d}</th>`).join("")}</tr>`;
  for (const p of periods) {
    if (p.isBreak) { html += `<tr>${td}${p.start}–${p.end}</td><td colspan="${DAYS.length}" style="padding:6px 8px;border:1px solid #d9dde3;font-size:12px;color:#666;text-align:center">${esc(p.label ?? "Break")}</td></tr>`; continue; }
    html += `<tr>${td}<b>P${p.number}</b><br>${p.start}–${p.end}</td>`;
    for (const d of DAYS) {
      const s = grid.get(`${d}|${p.number}`);
      html += s ? `${td}<b>${esc(s.subjectCode)}</b> ${esc(s.subjectName)}<br>${esc(s.semester)}${s.section ? " " + esc(s.section) : ""}${s.batch ? " · " + esc(s.batch) : ""}<br><span style="color:#555">${esc(s.room)} · ${esc(s.type)}</span></td>` : `${td}</td>`;
    }
    html += `</tr>`;
  }
  return html + `</table>`;
}

export interface EmailContent { subject: string; html: string; text: string }

export function firstPublishEmail(opts: { data: Dataset; faculty: Faculty; siteUrl: string; department: string; note?: string; semesterNames: string[] }): EmailContent {
  const { data, faculty, siteUrl, department, note } = opts;
  const mine = slotsForFaculty(data, faculty.id);
  const link = personalLink(siteUrl, faculty.id);
  const subject = `Timetable published: your ${opts.semesterNames.join(", ")} classes (${mine.length} periods/week)`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#1a1d21">
    <p style="font-size:13px;color:#666;margin:0 0 12px">${esc(department)}</p>
    <h2 style="margin:0 0 8px">Your timetable is published</h2>
    <p>Dear ${esc(faculty.name)},</p>
    <p>The semester timetable is now live. Your personal view, your classes, room and class timetables, and all future changes are at one link:</p>
    <p><a href="${link}" style="display:inline-block;background:#1f4e79;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">Open my timetable</a></p>
    ${note ? `<p style="background:#fff8e1;border-left:4px solid #f0b429;padding:8px 12px"><b>Note from the office:</b> ${esc(note)}</p>` : ""}
    <h3 style="margin:20px 0 8px">Your week (${mine.length} periods)</h3>
    ${weekTableHtml(data, mine)}
    <p style="font-size:12px;color:#666;margin-top:16px">Add to your calendar: <a href="${icsLink(siteUrl, faculty.id)}">${icsLink(siteUrl, faculty.id)}</a> (subscribe in Google Calendar or Outlook; it updates itself when the timetable changes).</p>
    <p style="font-size:12px;color:#666">You receive this because you are listed in the department timetable. Changes will be emailed to you only when they affect your classes.</p>
  </div>`;
  const text = `Your timetable is published.\n\nOpen my timetable: ${link}\n${note ? `\nNote: ${note}\n` : ""}\n${mine.map((s) => `${s.day} P${s.period} ${s.start}-${s.end}  ${s.subjectCode} ${s.subjectName} (${s.semester} ${s.section}) ${s.room}`).join("\n")}\n\nCalendar feed: ${icsLink(siteUrl, faculty.id)}`;
  return { subject, html, text };
}

export function changeEmail(opts: { data: Dataset; faculty: Faculty; changes: Change[]; siteUrl: string; department: string; note?: string; versionId: number }): EmailContent {
  const { data, faculty, changes, siteUrl, department, note, versionId } = opts;
  const link = personalLink(siteUrl, faculty.id) + `&alerts=1`;
  const n = changes.length;
  const subject = `Timetable update: ${n} change${n === 1 ? "" : "s"} to your classes (v${versionId})`;
  const mine = slotsForFaculty(data, faculty.id);
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#1a1d21">
    <p style="font-size:13px;color:#666;margin:0 0 12px">${esc(department)}</p>
    <h2 style="margin:0 0 8px">${n} change${n === 1 ? "" : "s"} to your timetable</h2>
    <p>Dear ${esc(faculty.name)},</p>
    ${note ? `<p style="background:#fff8e1;border-left:4px solid #f0b429;padding:8px 12px"><b>Note from the office:</b> ${esc(note)}</p>` : ""}
    <ul style="padding-left:18px">${changes.map((c) => `<li style="margin:6px 0">${esc(c.text)}</li>`).join("")}</ul>
    <p><a href="${link}" style="display:inline-block;background:#1f4e79;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">View and mark as seen</a></p>
    <h3 style="margin:20px 0 8px">Your updated week</h3>
    ${weekTableHtml(data, mine)}
    <p style="font-size:12px;color:#666;margin-top:16px">Version ${versionId}. Only changes that affect your classes are emailed to you.</p>
  </div>`;
  const text = `${n} change(s) to your timetable (version ${versionId})\n${note ? `\nNote: ${note}\n` : ""}\n${changes.map((c) => "- " + c.text).join("\n")}\n\nView and mark as seen: ${link}`;
  return { subject, html, text };
}

export function announcementEmail(opts: { title: string; body: string; faculty: Faculty; siteUrl: string; department: string }): EmailContent {
  const link = personalLink(opts.siteUrl, opts.faculty.id) + `&alerts=1`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#1a1d21">
    <p style="font-size:13px;color:#666;margin:0 0 12px">${esc(opts.department)}</p>
    <h2 style="margin:0 0 8px">${esc(opts.title)}</h2>
    <p>Dear ${esc(opts.faculty.name)},</p>
    <p style="white-space:pre-wrap">${esc(opts.body)}</p>
    <p><a href="${link}" style="display:inline-block;background:#1f4e79;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">Open the portal</a></p>
  </div>`;
  return { subject: `Timetable notice: ${opts.title}`, html, text: `${opts.title}\n\n${opts.body}\n\n${link}` };
}

// ---- ICS calendar feed: one weekly recurring event per slot, bounded by the semester dates.
const DOW: Record<string, string> = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA" };

export function icsForFaculty(data: Dataset, facultyId: string, calendarName: string, versionId: number): string {
  const slots = slotsForFaculty(data, facultyId);
  const semByName = new Map(data.semesters.map((s) => [s.name, s]));
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JUIT Timetable Portal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEsc(calendarName)}`, "X-WR-TIMEZONE:Asia/Kolkata", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const s of slots) {
    const sem = semByName.get(s.semester);
    if (!sem || !s.start || !s.end) continue;
    const first = firstDateOnOrAfter(sem.startDate, s.day);
    const dt = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:tt-${s.key.replace(/[^A-Za-z0-9]/g, "")}-${facultyId}@juitsolan.ac.in`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `SEQUENCE:${versionId}`,
      `DTSTART;TZID=Asia/Kolkata:${dt(first, s.start)}`,
      `DTEND;TZID=Asia/Kolkata:${dt(first, s.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DOW[s.day]};UNTIL=${sem.endDate.replace(/-/g, "")}T235959`,
      `SUMMARY:${icsEsc(`${s.subjectCode} ${s.subjectName} (${s.semester}${s.section ? " " + s.section : ""})`)}`,
      `LOCATION:${icsEsc(s.room)}`,
      `DESCRIPTION:${icsEsc(`${s.type}${s.batch ? " · " + s.batch : ""}${s.notes ? "\n" + s.notes : ""}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function firstDateOnOrAfter(isoDate: string, day: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const want = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
  while (d.getUTCDay() !== want) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
