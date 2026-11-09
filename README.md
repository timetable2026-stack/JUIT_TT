# JUIT Department Timetable Portal

One Excel upload → one permanent link for every faculty member → automatic change detection, alerts and email.
Built for the Department of CSE, Jaypee University of Information Technology, Solan (`juitsolan.ac.in`).

* **Faculty portal** (`/`) — no login. A faculty member picks their name once (or opens the personal link from their email) and sees *Today*, *My week*, class and room timetables, *Alerts*, the faculty directory and a common-free-period finder. Calendar subscription (`/api/ics/FAC001`) and print views included.
* **Admin panel** (`/admin`) — single password. Upload the master Excel → validation report → change review (by faculty / by class) → Publish. Also announcements, versions & rollback, "who has seen it" with re-email, people list, email log.
* **Emails** — sent only to faculty whose classes changed, one email per person per publish, from `timetable@juitsolan.ac.in` via Resend.

## 1. The Excel format

**You can upload the department's existing master file as-is.** The site detects the grid layout
(one sheet per year group, days down, periods across, `L-T-P | Sub Code | Batch | Faculty | Room`
under each hour) and converts it on upload. Names and emails already entered for faculty are
carried over from the live version automatically. The row-format template below is the other
accepted layout, and is what *Download current timetable as Excel* produces.


Four sheets. Download the exact template from the admin panel (*Download blank template*) or see `sample/Timetable_Sample_v1.xlsx`.

| Sheet | Columns |
| --- | --- |
| `Timetable` | Semester, Section, Day (Mon–Sat), Period, Start, End (optional), Subject code, Subject name, Type (Lecture/Lab/Tutorial/Seminar/Project), Faculty ID (several with `;`), Room, Batch (optional), Notes (optional) |
| `Faculty` | Faculty ID, Full name, Email, Department, Designation, Phone, Role (Faculty/HOD/Admin) |
| `Periods` | Period, Start, End, Break (Yes/blank), Label |
| `Semesters` | Semester, Start date, End date, Academic year, Exam window |

Upload is **rejected** (nothing changes) when a required column is missing, a Faculty ID / Period / Semester is unknown, a faculty member or a room is double-booked, a class has two entries in one slot, or an email is invalid/duplicated. Warnings (shown, not blocking): a subject with two names, more than 6 periods a day, a class scheduled in a break, a faculty member with no classes.

## 2. Deploy to Vercel (about 20 minutes)

1. **Database** — create a free project at [supabase.com](https://supabase.com). In *SQL editor*, paste and run `supabase/schema.sql`. Copy *Project URL* and the *service_role* key from *Settings → API*.
2. **Email** — create an account at [resend.com](https://resend.com), add the domain `juitsolan.ac.in`, and give the SPF/DKIM DNS records it shows to JUIT IT to add. Create an API key. (Until this is done the site works fully; emails are logged as "skipped".)
3. **Code** — push this folder to a GitHub repository (private is fine).
4. **Vercel** — [vercel.com/new](https://vercel.com/new) → import the repo → framework is detected as Next.js. Before *Deploy*, add the environment variables below. Deploy.
5. **Domain** — in Vercel → *Settings → Domains* add `timetable.juitsolan.ac.in`; give the CNAME it shows to IT. Set `NEXT_PUBLIC_SITE_URL` to that address and redeploy.
6. **First publish** — open `/admin`, sign in, upload the semester Excel, review, publish. Share the single link with the department.

### Environment variables

| Name | Value |
| --- | --- |
| `ADMIN_PASSWORD` | the one admin password |
| `ADMIN_SECRET` | any long random string (signs the admin cookie) |
| `CRON_SECRET` | any long random string; Vercel sends it with the scheduled 07:00 reminder run |
| `SUPABASE_URL` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase (keep secret; server-side only) |
| `RESEND_API_KEY` | from Resend |
| `EMAIL_FROM` | `JUIT Timetable <timetable@juitsolan.ac.in>` |
| `EMAIL_REPLY_TO` | the office mailbox that should receive replies |
| `NEXT_PUBLIC_SITE_URL` | `https://timetable.juitsolan.ac.in` |
| `NEXT_PUBLIC_DEPARTMENT_NAME` | `Department of Computer Science & Engineering` |
| `NEXT_PUBLIC_INSTITUTE_NAME` | `Jaypee University of Information Technology, Solan` |

## 2a. Daily reminders, downloads and preferences

* **Morning reminder** — at 07:00 IST on teaching days, every faculty member with classes that day
  gets one email listing them (time, course, group, room; plus any change published overnight and
  active announcements). Nobody is emailed on a day with no classes, on a holiday the office adds,
  or outside the semester dates. Runs from Vercel Cron (`vercel.json` → `/api/cron/daily-reminder`,
  authenticated with `CRON_SECRET`). The office can preview today's messages, send them by hand,
  pause the run, change the hour and days, and add holidays — all in *Daily reminders*.
* **Faculty preferences** — from their Today screen, each person can turn off the morning reminder
  or change-alert emails. Stored per faculty ID; no login needed.
* **Excel downloads** — every view has a *Download* button (`/api/export?kind=faculty|class|room&id=…`).
  The workbook has three sheets: a readable weekly grid, the office's one-row *Faculty view* format
  (Faculty · Dept · Periods/wk · MON P1 … SAT P8, cells as `CODE/BATCH/ROOM`) that pastes back into
  the master, and a plain list.

## 2b. Loading the existing JUIT master timetable (script alternative)

The department's master file (`Timetable_Jan_Jun_2027.xlsx`) is a grid: one sheet per year group,
days down the page and periods across, five sub-columns per period. `scripts/convert-juit-grid.py`
turns it into the row format this portal reads:

```bash
python3 scripts/convert-juit-grid.py Timetable_Jan_Jun_2027.xlsx converted.xlsx
# 1674 class rows · 128 faculty codes · 8 periods · 5 groups: PG1, Year 1, Year 2, Year 3, Year 4
```

Upload `converted.xlsx` in the admin panel. It validates with no blocking errors. Two things the
source file does not contain, which the office needs to fill in before emails can go out:

* **Faculty names and email addresses.** The source carries only codes (`RPS`, `JBSW_RS13`) and
  departments. Fill the `Full name` and `Email` columns of the `Faculty` sheet; until then the portal
  works and shows codes, and each publish is logged as "skipped" instead of emailed.
* **Course names.** Only 261 of 1,674 rows have a course name available in the source workbook; the
  rest display their course code. Adding a code-to-name sheet is the simplest fix.

Elective buckets are handled: where several electives run in parallel for one batch pool
(`Other[25A11,…]`, `E1_B1_1`), each is a separate class, and the portal shows a short bucket label
with the full batch list on the class detail. `TBA` is treated as "not yet assigned" and never
reported as a clash.

## 3. Run locally

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD; leave SUPABASE_* blank to use ./data/db.json
npm run dev                   # http://localhost:3000  and  /admin
```

`npm run typecheck` checks the code. Engine test without a browser: `npx tsx scripts/test-engine.ts <v1.json> <v2.json>` (see `scripts/`).

## 4. How publishing works

```
Excel ─► /api/admin/upload ─► parse + validate (lib/excel.ts)
                              ─► diff vs live version (lib/diff.ts) ─► stored as DRAFT
Admin reviews ─► /api/admin/publish ─► draft becomes PUBLISHED, old one SUPERSEDED
                                     ─► changes = the Alerts list (per faculty)
                                     ─► emails to affected faculty (lib/email.ts via Resend)
Portal /api/timetable always serves the PUBLISHED version; /api/ics/<id> serves its calendar.
```

Change types detected: added, removed, moved (same class in a new slot), reassigned (faculty changed; both old and new are alerted), room changed, details changed (name/notes/time), period-grid changed (everyone alerted). Rollback republishes an old version as a new one, so it produces its own diff and alerts.

## 5. Project layout

```
app/                 Next.js routes: / (portal), /admin, /api/* (incl. /api/cron/daily-reminder, /api/export, /api/prefs)
vercel.json          cron schedule for the morning reminder (01:30 UTC = 07:00 IST)
components/          Portal.tsx, Admin.tsx, shared.tsx (timetable grid, modals)
lib/                 excel.ts (parse+validate), grid.ts (grid-format detection + conversion), diff.ts,
                     format.ts (emails, ICS), reminders.ts + runReminders.ts (daily reminder), exportGrid.ts
                     (Excel downloads), publish.ts, store.ts (Supabase or local JSON), email.ts (Resend), auth.ts
supabase/schema.sql  database tables
sample/              Timetable_Sample_v1.xlsx and _v2_changes.xlsx (24 changes) for testing
demo/                browser-only demo build of the same UI (not deployed)
scripts/             make-sample.py, test-engine.ts
```

## 6. Suggested next steps (already designed for)

Student view (public class timetable at the same link), one-day substitution notices, room utilisation and workload reports, WhatsApp channel, exam-timetable mode — see the blueprint document.
