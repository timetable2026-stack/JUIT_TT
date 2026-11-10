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
const salute = (f: Faculty) => (f.name && f.name !== f.id ? f.name : "Colleague");
const niceDate = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };
const shortBatch = (b?: string) => { if (!b) return ""; const m = b.match(/^([^[]+)\[/); if (m) return m[1].trim(); const parts = b.split(",").map((x) => x.trim()).filter(Boolean); return parts.length > 3 ? `${parts[0]} +${parts.length - 1}` : parts.join(", "); };

// ---------- shared pieces
const NAVY = "#1f3a5f";
function shell(o: { department: string; institute?: string; preheader?: string; body: string; footer: string }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f9;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1d21">
    <tr><td style="background:${NAVY};color:#fff;padding:16px 24px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.85">${esc(o.department)}</div>
      <div style="font-size:18px;font-weight:bold;margin-top:2px">JUIT Timetable</div>
    </td></tr>
    <tr><td style="padding:24px">${o.body}</td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e3e7ec;font-size:12px;color:#6b7684;line-height:1.5">${o.footer}${o.institute ? `<br>${esc(o.institute)}` : ""}</td></tr>
  </table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) => `<a href="${href}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;font-size:15px">${label}</a>`;
const note = (text: string) => `<div style="background:#fff6d6;border-left:4px solid #f0b429;padding:10px 14px;border-radius:0 8px 8px 0;margin:16px 0"><b>Note from the TTC:</b> ${esc(text)}</div>`;
const linkLine = (href: string) => `<div style="font-size:12px;color:#6b7684;margin-top:8px;word-break:break-all">If the button does not open, copy this link: <a href="${href}" style="color:${NAVY}">${href}</a></div>`;

function weekTableHtml(data: Dataset, slots: Slot[]) {
  const grid = new Map<string, Slot>();
  for (const s of slots) grid.set(`${s.day}|${s.period}`, s);
  const th = `<th style="padding:7px 8px;border:1px solid #d9dde3;background:#eef2f7;font-size:12px;text-align:left;color:#1f3a5f">`;
  const td = `<td style="padding:7px 8px;border:1px solid #d9dde3;font-size:12px;vertical-align:top">`;
  let html = `<table role="presentation" style="border-collapse:collapse;width:100%">`;
  html += `<tr>${th}Period</th>${DAYS.map((d) => `${th}${d}</th>`).join("")}</tr>`;
  for (const p of data.periods) {
    if (p.isBreak) { html += `<tr>${td}${p.start}–${p.end}</td><td colspan="${DAYS.length}" style="padding:7px 8px;border:1px solid #d9dde3;font-size:12px;color:#666;text-align:center;background:#fafbfc">${esc(p.label ?? "Break")}</td></tr>`; continue; }
    html += `<tr>${td}<b>P${p.number}</b><br><span style="color:#6b7684">${p.start}–${p.end}</span></td>`;
    for (const d of DAYS) {
      const s = grid.get(`${d}|${p.number}`);
      html += s ? `${td}<b>${esc(s.subjectCode)}</b><br>${esc(s.semester)}${s.batch ? " · " + esc(shortBatch(s.batch)) : ""}<br><span style="color:#5b6573">${esc(s.room)}${s.type !== "Lecture" ? " · " + esc(s.type) : ""}</span></td>` : `${td}</td>`;
    }
    html += `</tr>`;
  }
  return html + `</table>`;
}

export interface EmailContent { subject: string; html: string; text: string }

// ---------- 1. First publish of the semester
export function firstPublishEmail(opts: { data: Dataset; faculty: Faculty; siteUrl: string; department: string; institute?: string; note?: string; semesterNames: string[] }): EmailContent {
  const { data, faculty, siteUrl, department } = opts;
  const mine = slotsForFaculty(data, faculty.id);
  const link = personalLink(siteUrl, faculty.id);
  const sem = data.semesters[0];
  const term = sem ? `${niceDate(sem.startDate)} to ${niceDate(sem.endDate)}` : "";
  const subject = `Your timetable for ${opts.semesterNames.length > 1 ? "the semester" : opts.semesterNames[0]} is published — ${mine.length} periods/week`;
  const body = `
    <h2 style="margin:0 0 6px;font-size:20px">Dear ${esc(salute(faculty))},</h2>
    <p style="margin:0 0 14px;line-height:1.55">The university timetable${term ? ` for <b>${esc(term)}</b>` : ""} is now published. Your classes, room and section timetables, the faculty directory and every future change are available at one permanent link. No password is needed; the link below opens your personal view.</p>
    <p style="margin:0 0 6px">${button(link, "Open my timetable")}</p>${linkLine(link)}
    ${opts.note ? note(opts.note) : ""}
    <h3 style="margin:22px 0 8px;font-size:15px;color:${NAVY}">Your week — ${mine.length} period${mine.length === 1 ? "" : "s"}</h3>
    ${mine.length ? weekTableHtml(data, mine) : `<p style="color:#6b7684">No classes are assigned to you in this timetable.</p>`}
    <h3 style="margin:22px 0 6px;font-size:15px;color:${NAVY}">What to expect from now on</h3>
    <ul style="margin:0;padding-left:20px;line-height:1.6">
      <li>If one of your classes is moved, reassigned or changes room, you receive one email listing exactly what changed.</li>
      <li>Each teaching morning at 7:00 you receive a short list of that day's classes. You can turn this off from your timetable page.</li>
      <li>Add the timetable to your phone or Outlook calendar: <a href="${icsLink(siteUrl, faculty.id)}" style="color:${NAVY}">calendar subscription</a> (it updates itself when the timetable changes).</li>
    </ul>
    <p style="margin:18px 0 0;line-height:1.55">If anything in your timetable looks wrong, reply to this email and the Time Table Committee will correct it.</p>`;
  const html = shell({ department, institute: opts.institute, preheader: `${mine.length} periods this week. Open your personal timetable.`, body, footer: `You are receiving this because you are listed in the university timetable. Replies go to the Time Table Committee.` });
  const text = `Dear ${salute(faculty)},\n\nThe university timetable${term ? ` for ${term}` : ""} is now published.\n\nOpen my timetable: ${link}\n${opts.note ? `\nNote from the TTC: ${opts.note}\n` : ""}\nYour week (${mine.length} periods):\n${mine.map((s) => `  ${s.day} P${s.period} ${s.start}-${s.end}  ${s.subjectCode}  ${s.semester}${s.batch ? " " + shortBatch(s.batch) : ""}  ${s.room}`).join("\n")}\n\nYou will be emailed when your classes change, and each teaching morning with that day's classes.\nCalendar subscription: ${icsLink(siteUrl, faculty.id)}\n\nIf anything looks wrong, reply to this email.`;
  return { subject, html, text };
}

// ---------- 2. Changes after a revised timetable
export function changeEmail(opts: { data: Dataset; faculty: Faculty; changes: Change[]; siteUrl: string; department: string; institute?: string; note?: string; versionId: number }): EmailContent {
  const { data, faculty, changes, siteUrl, department, versionId } = opts;
  const link = personalLink(siteUrl, faculty.id) + `&alerts=1`;
  const n = changes.length;
  const subject = `Timetable change: ${n === 1 ? "1 class" : `${n} of your classes`} updated`;
  const mine = slotsForFaculty(data, faculty.id);
  const body = `
    <h2 style="margin:0 0 6px;font-size:20px">Dear ${esc(salute(faculty))},</h2>
    <p style="margin:0 0 14px;line-height:1.55">The university timetable has been revised. ${n === 1 ? "One change affects your classes" : `${n} changes affect your classes`}:</p>
    <ol style="margin:0 0 16px;padding-left:22px;line-height:1.6">${changes.map((c) => `<li style="margin:4px 0">${esc(c.text)}</li>`).join("")}</ol>
    ${opts.note ? note(opts.note) : ""}
    <p style="margin:0 0 6px">${button(link, "View changes and mark as seen")}</p>${linkLine(link)}
    <h3 style="margin:22px 0 8px;font-size:15px;color:${NAVY}">Your updated week</h3>
    ${weekTableHtml(data, mine)}
    <p style="margin:18px 0 0;line-height:1.55">Please press <i>Mark as seen</i> on the page so the TTC knows the change reached you. If a change creates a clash for you, reply to this email.</p>`;
  const html = shell({ department, institute: opts.institute, preheader: changes[0]?.text, body, footer: `Timetable version ${versionId}. Only changes that affect your own classes are emailed to you.` });
  const text = `Dear ${salute(faculty)},\n\nThe university timetable has been revised. ${n} change(s) affect your classes:\n${changes.map((c, i) => `  ${i + 1}. ${c.text}`).join("\n")}\n${opts.note ? `\nNote from the TTC: ${opts.note}\n` : ""}\nView changes and mark as seen: ${link}\n\nTimetable version ${versionId}.`;
  return { subject, html, text };
}

// ---------- 3. Office announcement
export function announcementEmail(opts: { title: string; body: string; faculty: Faculty; siteUrl: string; department: string; institute?: string }): EmailContent {
  const link = personalLink(opts.siteUrl, opts.faculty.id) + `&alerts=1`;
  const body = `
    <h2 style="margin:0 0 6px;font-size:20px">${esc(opts.title)}</h2>
    <p style="margin:0 0 14px;color:#6b7684">Notice from the Time Table Committee</p>
    <p style="margin:0 0 18px;line-height:1.6;white-space:pre-wrap">${esc(opts.body)}</p>
    <p style="margin:0 0 6px">${button(link, "Open the timetable portal")}</p>${linkLine(link)}`;
  const html = shell({ department: opts.department, institute: opts.institute, preheader: opts.body.slice(0, 120), body, footer: `Sent to faculty by the Time Table Committee. Reply to this email to reach the TTC.` });
  return { subject: `Timetable notice: ${opts.title}`, html, text: `${opts.title}\n\n${opts.body}\n\nOpen the portal: ${link}` };
}

// ---------- ICS calendar feed: one weekly recurring event per slot, bounded by the semester dates.
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
      `UID:tt-${s.key.replace(/[^A-Za-z0-9]/g, "")}-${facultyId}@juitsolan.in`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `SEQUENCE:${versionId}`,
      `DTSTART;TZID=Asia/Kolkata:${dt(first, s.start)}`,
      `DTEND;TZID=Asia/Kolkata:${dt(first, s.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DOW[s.day]};UNTIL=${sem.endDate.replace(/-/g, "")}T235959`,
      `SUMMARY:${icsEsc(`${s.subjectCode}${s.subjectName && s.subjectName !== s.subjectCode ? " " + s.subjectName : ""} (${s.semester}${s.batch ? " " + shortBatch(s.batch) : ""})`)}`,
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
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
